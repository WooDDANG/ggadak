import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from './server.js';
import { DecisionRepository } from './repositories/decision.repository.js';
import { isolatedRepository } from './repositories/test-database.js';

describe('BE Server & Ingestion API', () => {
  let server: http.Server;
  let repo: DecisionRepository;
  let port: number;
  let database: Awaited<ReturnType<typeof isolatedRepository>>;

  before(async () => {
    database = await isolatedRepository();
    repo = database.repo;
    server = await createServer(repo);
    await new Promise<void>(resolve => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => {
        resolve();
      });
    });
    await database.cleanup();
  });

  it('ingests a valid decision webhook via POST /api/webhooks/decisions', async () => {
    const payload = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: {
        id: 'DEC-101',
        topic: 'Architecture',
        decision: 'Split into 3-tier monorepo',
        rationale: 'Isolates bot gateway from web APIs and frontend rendering',
        actionItems: [{ task: 'Create workspaces', assignee: 'wooddang' }],
        state: 'Decided',
        supersedesId: null,
        source: {
          guildId: 'guild-1',
          channelId: 'chan-1',
          triggerMessageId: 'msg-1',
          participants: ['wooddang'],
        },
        createdAt: '2026-09-28T14:20:00.000Z',
      },
    };

    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.id, 'DEC-101');

    // Verify stored
    const stored = await repo.getDecisionById('DEC-101');
    assert.ok(stored);
    assert.strictEqual(stored.decision, 'Split into 3-tier monorepo');
  });

  it('queries decision list via GET /api/decisions', async () => {
    const res = await fetch(`http://localhost:${port}/api/decisions`);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(Array.isArray(data.decisions));
    assert.strictEqual(data.decisions.length, 1);
  });

  it('requires authentication to read v1 Decision Records', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/decisions?topic=Architecture`);
    assert.strictEqual(response.status, 401);
    assert.strictEqual(((await response.json()) as any).code, 'UNAUTHORIZED');
  });

  it('returns a v1 error envelope for unknown routes while preserving legacy errors', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/missing`);
    assert.strictEqual(response.status, 404);
    assert.deepStrictEqual(await response.json(), {
      success: false,
      code: 'NOT_FOUND',
      message: 'Not Found',
      data: null,
    });
    const legacy = await fetch(`http://localhost:${port}/api/missing`);
    assert.deepStrictEqual(await legacy.json(), { error: 'Not Found' });
  });

  it('uses the v1 validation envelope for malformed JSON', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.strictEqual(response.status, 400);
    const body = (await response.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, 'VALIDATION_ERROR');
    assert.strictEqual(body.data, null);
    assert.strictEqual(typeof body.message, 'string');
  });

  it('does not replace existing decisions through ordinary ingestion', async () => {
    const payload2 = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: {
        id: 'DEC-102',
        topic: 'Architecture',
        decision: 'Expand monorepo with dedicated shared types',
        rationale: 'Allows FE, BE, BOT to share Zod schemas',
        actionItems: [],
        state: 'Decided',
        supersedesId: 'DEC-101',
        source: {
          guildId: 'guild-1',
          channelId: 'chan-1',
          triggerMessageId: 'msg-2',
          participants: ['wooddang'],
        },
        createdAt: '2026-09-28T14:25:00.000Z',
      },
    };

    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload2),
    });
    assert.strictEqual(res.status, 201);

    // Verify DEC-101 is now Superseded and DEC-102 is Decided
    const dec1 = await repo.getDecisionById('DEC-101');
    const dec2 = await repo.getDecisionById('DEC-102');
    assert.strictEqual(dec1?.state, 'Decided');
    assert.strictEqual(dec2?.state, 'Decided');
  });

  it('rejects invalid payload format', async () => {
    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('manages channel checkpoints via GET and POST /api/channels/:channelId/checkpoint', async () => {
    // 1. Initial GET should return null for lastMessageId
    const res1 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`);
    assert.strictEqual(res1.status, 200);
    const data1 = (await res1.json()) as any;
    assert.strictEqual(data1.channelId, 'test-chan-1');
    assert.strictEqual(data1.lastMessageId, null);

    // 2. POST to save checkpoint
    const res2 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastMessageId: 'msg-999' }),
    });
    assert.strictEqual(res2.status, 200);

    // 3. GET should return updated lastMessageId
    const res3 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`);
    assert.strictEqual(res3.status, 200);
    const data3 = (await res3.json()) as any;
    assert.strictEqual(data3.lastMessageId, 'msg-999');
  });

  it('exposes centralized harvesting policy via GET /api/config/policy', async () => {
    const res = await fetch(`http://localhost:${port}/api/config/policy`);
    assert.strictEqual(res.status, 200);
    const policy = (await res.json()) as any;
    assert.strictEqual(policy.initialScanLimit, 50);
    assert.strictEqual(policy.contextWindowBefore, 15);
    assert.strictEqual(policy.contextWindowAfter, 5);
    assert.strictEqual(policy.reactionThreshold, 3);
  });

  it('handles decision review workflow via POST /api/decisions/:id/review', async () => {
    // Save draft decision
    await repo.saveDecision({
      id: 'DEC-DRAFT-1',
      topic: 'UI Framework',
      decision: 'Tailwind CSS',
      title: 'Adopt Tailwind CSS',
      decisionContent: 'Use Tailwind CSS for styling',
      rationale: 'Utility classes speed up frontend development',
      rationaleQuotes: ['Alex: Tailwind CSS로 빠르게 스타일링하죠.'],
      alternatives: [{ option: 'Styled Components', reason: 'Runtime overhead' }],
      categoryTag: '기술',
      actionItems: [],
      state: 'Draft',
      supersedesId: null,
      isPivot: false,
      approvedBy: null,
      decisionConfirmedDate: null,
      feedbackSourceType: null,
      feedbackSourceDetail: null,
      feedbackReceivedDate: null,
      rawEvidence: ['msg-1', 'msg-2'],
      evidenceHash: 'hash-tailwind-123',
      source: {
        guildId: 'g1',
        channelId: 'c1',
        triggerMessageId: 'm1',
        participants: [],
        rawMessages: [],
      },
      createdAt: new Date().toISOString(),
    });

    // 1. Confirm review action
    const res = await fetch(`http://localhost:${port}/api/decisions/DEC-DRAFT-1/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        expectedVersion: 1,
        approvedBy: 'reviewer_wooddang',
        title: 'Adopt Tailwind CSS v4',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.decision.state, 'Decided');
    assert.strictEqual(body.decision.approvedBy, 'reviewer_wooddang');
    assert.strictEqual(body.decision.title, 'Adopt Tailwind CSS v4');

    // 2. Reject another draft and check anti-recreation hash
    await repo.saveDecision({
      id: 'DEC-DRAFT-2',
      topic: 'Invalid Proposal',
      decision: 'Use Flash',
      rationale: 'None',
      rationaleQuotes: [],
      alternatives: [],
      categoryTag: '기술',
      actionItems: [],
      state: 'Draft',
      supersedesId: null,
      isPivot: false,
      approvedBy: null,
      decisionConfirmedDate: null,
      feedbackSourceType: null,
      feedbackSourceDetail: null,
      feedbackReceivedDate: null,
      rawEvidence: ['msg-x'],
      evidenceHash: 'hash-rejected-999',
      source: {
        guildId: 'g1',
        channelId: 'c1',
        triggerMessageId: 'mx',
        participants: [],
        rawMessages: [],
      },
      createdAt: new Date().toISOString(),
    });

    const resReject = await fetch(`http://localhost:${port}/api/decisions/DEC-DRAFT-2/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', expectedVersion: 1 }),
    });
    assert.strictEqual(resReject.status, 200);
    assert.strictEqual(await repo.isEvidenceRejected('hash-rejected-999'), true);
  });

  it('manages external feedback via POST and GET /api/feedbacks', async () => {
    const feedbackPayload = {
      id: 'FB-001',
      source: '교수',
      detail: '캡스톤 중간발표',
      content: '대학생 전체보다 동아리 프로젝트 팀으로 타깃을 좁혀보세요.',
      channelId: 'chan-feedback-1',
      createdAt: new Date().toISOString(),
    };

    const postRes = await fetch(`http://localhost:${port}/api/feedbacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackPayload),
    });
    assert.strictEqual(postRes.status, 201);

    const getRes = await fetch(`http://localhost:${port}/api/feedbacks?channelId=chan-feedback-1`);
    assert.strictEqual(getRes.status, 200);
    const getData = (await getRes.json()) as any;
    assert.strictEqual(getData.feedbacks.length, 1);
    assert.strictEqual(getData.feedbacks[0].content, feedbackPayload.content);
    assert.strictEqual(getData.feedbacks[0].source, '교수');
  });
  it('returns the common v1 envelope when the request limit is exceeded', async () => {
    const previous = process.env.DISABLE_RATE_LIMIT;
    process.env.DISABLE_RATE_LIMIT = 'false';
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      let response: Response;
      for (let index = 0; index < 121; index++) {
        response = await fetch(`http://localhost:${port}/api/v1/decisions`);
        if (response.status === 429) break;
        await response.text();
      }
      assert.strictEqual(response!.status, 429);
      const body = (await response!.json()) as any;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.code, 'RATE_LIMITED');
      assert.strictEqual(body.data, null);
    } finally {
      if (previous === undefined) delete process.env.DISABLE_RATE_LIMIT;
      else process.env.DISABLE_RATE_LIMIT = previous;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
  });
});
