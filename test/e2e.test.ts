import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../apps/be/dist/server.js';
import { DecisionRepository } from '../apps/be/dist/db.js';
import { BackendExtractionEngine } from '../apps/be/dist/extractor/engine.js';

describe('E2E Full Pipeline: Discord Messages ➔ Backend AI Core ➔ Review Queue ➔ DB ➔ Query', () => {
  it('extracts multi-decision candidates in DRAFT state and confirms via Review Queue', async () => {
    // 1. Start Backend Server with Mock AI Engine
    const repo = new DecisionRepository();
    const extractor = new BackendExtractionEngine();
    const server = createServer(repo, extractor);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    // 2. Centralized Policy verification
    const policyRes = await fetch(`http://localhost:${port}/api/config/policy`);
    assert.strictEqual(policyRes.status, 200);
    const policy = (await policyRes.json()) as any;
    assert.strictEqual(policy.reactionThreshold, 3);
    assert.strictEqual(policy.maxMergedWindow, 40);

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
    const analyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMessages,
        guildId: 'guild-demo',
        channelId: 'chan-arch',
        channelName: 'dev-architecture',
        triggerMessageId: 'msg-103',
        messageUrl: 'https://discord.com/channels/guild-demo/chan-arch/msg-103',
      }),
    });

    assert.strictEqual(analyzeRes.status, 200);
    const analyzeData = (await analyzeRes.json()) as any;

    assert.strictEqual(analyzeData.found, true);
    assert.strictEqual(analyzeData.decisions.length, 2); // Multi-decision extraction

    const postgresDec = analyzeData.decisions.find((d: any) => d.topic === 'Database Selection');
    const fastifyDec = analyzeData.decisions.find((d: any) => d.topic === 'Backend Framework');

    assert.ok(postgresDec);
    assert.ok(fastifyDec);
    assert.strictEqual(postgresDec.state, 'Draft'); // Initial state is Draft (PM policy)
    assert.strictEqual(postgresDec.categoryTag, '기술');
    assert.ok(postgresDec.alternatives.length > 0);
    assert.ok(postgresDec.rawTranscript.includes('PostgreSQL'));
    assert.strictEqual(postgresDec.source.rawMessages.length, 3);

    // 5. Human Review Action: Confirm Postgres Decision
    const reviewRes = await fetch(
      `http://localhost:${port}/api/decisions/${postgresDec.id}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          approvedBy: 'reviewer_wooddang',
        }),
      },
    );
    assert.strictEqual(reviewRes.status, 200);
    const reviewData = (await reviewRes.json()) as any;
    assert.strictEqual(reviewData.decision.state, 'Decided');
    assert.strictEqual(reviewData.decision.approvedBy, 'reviewer_wooddang');

    // 6. Query Decisions via GET /api/decisions
    const queryRes = await fetch(`http://localhost:${port}/api/decisions?state=Decided`);
    assert.strictEqual(queryRes.status, 200);
    const queryData = (await queryRes.json()) as any;
    assert.strictEqual(queryData.decisions.length, 1);
    assert.strictEqual(queryData.decisions[0].id, postgresDec.id);

    // 7. Test Anti-recreation on Rejection
    const rejectRes = await fetch(
      `http://localhost:${port}/api/decisions/${fastifyDec.id}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      },
    );
    assert.strictEqual(rejectRes.status, 200);

    // Re-analyzing the same messages should be skipped by anti-recreation hash
    const reAnalyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMessages,
        guildId: 'guild-demo',
        channelId: 'chan-arch',
        triggerMessageId: 'msg-103',
      }),
    });
    const reAnalyzeData = (await reAnalyzeRes.json()) as any;
    assert.strictEqual(reAnalyzeData.found, false);

    server.close();
    repo.close();
  });

  it('handles casual chatter with no decisions', async () => {
    const repo = new DecisionRepository();
    const server = createServer(repo, new BackendExtractionEngine());
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMessages: [
          {
            author: 'wooddang',
            content: '오늘 점심 뭐 먹을까요?',
            createdAt: '2026-09-28T12:00:00Z',
          },
        ],
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.found, false);
    assert.strictEqual(data.decisions.length, 0);

    server.close();
    repo.close();
  });
});
