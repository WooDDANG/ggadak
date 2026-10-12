import { describe, it, expect } from 'vitest';
import { createServer } from '../../apps/be/src/server.js';
import { isolatedRepository } from '../../apps/be/src/repositories/test-database.js';
import type { IAiAdapter } from '../../apps/be/src/adapters/ai.adapter.js';
import { fakeAuthOptions, loginAsTestUser } from '../../apps/be/src/test-support/auth.js';

// Fixed AI responses keep this pipeline regression independent of providers and API keys.
const decisionExtractor: IAiAdapter = {
  async analyzeTranscript() {
    return {
      found: true,
      summary: '두 개의 의사결정 후보',
      decisions: [
        {
          topic: 'Database Selection',
          decision: 'PostgreSQL 채택',
          rationale: '트랜잭션 정합성 보장',
          rationaleQuotes: [],
          alternatives: [{ option: 'MongoDB', reason: '정합성 요구' }],
          categoryTag: '기술',
          actionItems: [],
          isPivot: false,
        },
        {
          topic: 'Backend Framework',
          decision: 'Fastify 채택',
          rationale: '비동기 처리량',
          rationaleQuotes: [],
          alternatives: [],
          categoryTag: '기술',
          actionItems: [],
          isPivot: false,
        },
      ],
    };
  },
};

const noDecisionExtractor: IAiAdapter = {
  async analyzeTranscript() {
    return { found: false, summary: '의사결정 없음', decisions: [] };
  },
};

describe('E2E Full Pipeline: Discord Messages ➔ Backend AI Core ➔ Review Queue ➔ DB ➔ Query', () => {
  it('extracts multi-decision candidates in DRAFT state and confirms via Review Queue', async () => {
    // 1. Start Backend Server with Mock AI Engine
    const database = await isolatedRepository();
    const repo = database.repo;
    const extractor = decisionExtractor;
    const serviceToken = 'e2e-bot-secret';
    const server = await createServer(repo, extractor, { ...fakeAuthOptions(), serviceToken });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;
    const { token } = await loginAsTestUser(base);
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. Centralized Policy verification
    const policyRes = await fetch(`${base}/api/config/policy`);
    expect(policyRes.status).toBe(200);
    const policy = (await policyRes.json()) as any;
    expect(policy.reactionThreshold).toBe(3);
    expect(policy.maxMergedWindow).toBe(40);

    // 3. Simulate raw Discord discussion messages
    const rawMessages = [
      {
        id: 'msg-101',
        author: 'wooddang',
        content: '메인 데이터베이스랑 백엔드 프레임워크 결정합시다.',
        createdAt: '2026-09-28T14:30:00Z',
      },
      {
        id: 'msg-102',
        author: 'alex',
        content: '트랜잭션 때문에 DB는 PostgreSQL로 가고, 서버 프레임워크는 Fastify로 가시죠.',
        createdAt: '2026-09-28T14:31:00Z',
        replyingTo: 'wooddang',
      },
      {
        id: 'msg-103',
        author: 'wooddang',
        content: '좋습니다! PostgreSQL + Fastify 조합으로 확정하겠습니다.',
        createdAt: '2026-09-28T14:32:00Z',
      },
    ];

    // 4. Call Backend AI Analysis Endpoint
    const analyzeRes = await fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'e2e-initial',
        rawMessages,
        guildId: 'guild-1',
        channelId: 'chan-arch',
        channelName: 'dev-architecture',
        triggerMessageId: 'msg-103',
        messageUrl: 'https://discord.com/channels/guild-1/chan-arch/msg-103',
      }),
    });

    expect(analyzeRes.status).toBe(200);
    const analyzeData = (await analyzeRes.json()) as any;

    expect(analyzeData.found).toBe(true);
    expect(analyzeData.decisions.length).toBe(2); // Multi-decision extraction

    const postgresDec = analyzeData.decisions.find((d: any) => d.topic === 'Database Selection');
    const fastifyDec = analyzeData.decisions.find((d: any) => d.topic === 'Backend Framework');

    expect(postgresDec).toBeTruthy();
    expect(fastifyDec).toBeTruthy();
    expect(postgresDec.state).toBe('Draft'); // Initial state is Draft (PM policy)
    expect(postgresDec.categoryTag).toBe('기술');
    expect(typeof postgresDec.governanceScore === 'number').toBeTruthy();
    expect(postgresDec.alternatives.length > 0).toBeTruthy();
    expect(postgresDec.rawTranscript.includes('PostgreSQL')).toBeTruthy();
    expect(postgresDec.source.rawMessages.length).toBe(3);

    // 5. Human Review Action: Confirm Postgres Decision
    const reviewRes = await fetch(
      `${base}/api/v1/review-queue/${postgresDec.id}/review?guildId=guild-1`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          expectedVersion: postgresDec.version,
          resolution: 'independent',
        }),
      },
    );
    expect(reviewRes.status).toBe(200);
    const reviewData = (await reviewRes.json()) as any;
    expect(reviewData.data.state).toBe('Decided');
    expect(reviewData.data.approvedBy).toBe('user-1');

    // 6. Query confirmed decisions through the authenticated v1 read API.
    const queryRes = await fetch(`${base}/api/v1/decisions?guildId=guild-1&status=CONFIRMED`, {
      headers: authHeaders,
    });
    expect(queryRes.status).toBe(200);
    const queryData = (await queryRes.json()) as any;
    expect(queryData.data.decisions.length).toBe(1);
    expect(queryData.data.decisions[0].id).toBe(postgresDec.id);

    // 7. Test Anti-recreation on Rejection
    const rejectRes = await fetch(
      `${base}/api/v1/review-queue/${fastifyDec.id}/review?guildId=guild-1`,
      {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', expectedVersion: fastifyDec.version }),
      },
    );
    expect(rejectRes.status).toBe(200);

    // Re-analysis retains the confirmed candidate and suppresses only the rejected candidate.
    const reAnalyzeRes = await fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'e2e-passive',
        rawMessages,
        guildId: 'guild-1',
        channelId: 'chan-arch',
        triggerMessageId: 'msg-103',
        isManualOverride: false,
      }),
    });
    const reAnalyzeData = (await reAnalyzeRes.json()) as any;
    expect(reAnalyzeData.found).toBe(true);
    expect(reAnalyzeData.decisions.length).toBe(1);
    expect(reAnalyzeData.decisions[0].id).toBe(postgresDec.id);
    expect(!reAnalyzeData.decisions.some((d: any) => d.id === fastifyDec.id)).toBeTruthy();

    // But with isManualOverride: true (e.g. 📌 pin added), re-analysis is permitted!
    const manualOverrideRes = await fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'e2e-manual',
        rawMessages,
        guildId: 'guild-1',
        channelId: 'chan-arch',
        triggerMessageId: 'msg-103',
        isManualOverride: true,
      }),
    });
    const manualOverrideData = (await manualOverrideRes.json()) as any;
    expect(manualOverrideData.found).toBe(true);
    expect(manualOverrideData.decisions.length > 0).toBeTruthy();

    server.close();
    await database.cleanup();
  });

  it('handles casual chatter with no decisions', async () => {
    const database = await isolatedRepository();
    const repo = database.repo;
    const serviceToken = 'e2e-bot-secret';
    const server = await createServer(repo, noDecisionExtractor, {
      ...fakeAuthOptions(),
      serviceToken,
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 'e2e-chatter',
        rawMessages: [
          {
            author: 'wooddang',
            content: '오늘 점심 뭐 먹을까요?',
            createdAt: '2026-09-28T12:00:00Z',
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.found).toBe(false);
    expect(data.decisions.length).toBe(0);

    server.close();
    await database.cleanup();
  });
});
