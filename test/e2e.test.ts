import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../apps/be/dist/server.js';
import { DecisionRepository } from '../apps/be/dist/db.js';
import { BackendExtractionEngine } from '../apps/be/dist/extractor/engine.js';

describe('E2E Full Pipeline: Discord Messages ➔ Backend AI Core ➔ DB ➔ Query', () => {
  it('extracts multi-decisions via POST /api/discussions/analyze and queries them', async () => {
    // 1. Start Backend Server with Mock AI Engine
    const repo = new DecisionRepository(':memory:');
    const extractor = new BackendExtractionEngine();
    const server = createServer(repo, extractor);

    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    // 2. Simulate raw Discord discussion messages
    const rawMessages = [
      {
        author: 'wooddang',
        content: '메인 데이터베이스랑 백엔드 프레임워크 결정합시다.',
        createdAt: '2026-09-28T14:30:00Z'
      },
      {
        author: 'alex',
        content: '트랜잭션 때문에 DB는 PostgreSQL로 가고, 서버 프레임워크는 Fastify로 가시죠.',
        createdAt: '2026-09-28T14:31:00Z',
        replyingTo: 'wooddang'
      },
      {
        author: 'wooddang',
        content: '좋습니다! PostgreSQL + Fastify 조합으로 확정하겠습니다.',
        createdAt: '2026-09-28T14:32:00Z'
      }
    ];

    // 3. Call Backend AI Analysis Endpoint
    const analyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMessages,
        guildId: 'guild-demo',
        channelId: 'chan-arch',
        channelName: 'dev-architecture',
        triggerMessageId: 'msg-103',
        messageUrl: 'https://discord.com/channels/guild-demo/chan-arch/msg-103'
      })
    });

    assert.strictEqual(analyzeRes.status, 200);
    const analyzeData = await analyzeRes.json() as any;

    assert.strictEqual(analyzeData.found, true);
    assert.strictEqual(analyzeData.decisions.length, 2); // Multi-decision extraction (Postgres + Fastify)

    const postgresDec = analyzeData.decisions.find((d: any) => d.topic === 'Database Selection');
    const fastifyDec = analyzeData.decisions.find((d: any) => d.topic === 'Backend Framework');

    assert.ok(postgresDec);
    assert.ok(fastifyDec);
    assert.ok(postgresDec.rawTranscript.includes('PostgreSQL'));
    assert.strictEqual(postgresDec.source.rawMessages.length, 3);

    // 4. Query Decisions via GET /api/decisions
    const queryRes = await fetch(`http://localhost:${port}/api/decisions`);
    assert.strictEqual(queryRes.status, 200);
    const queryData = await queryRes.json() as any;

    assert.strictEqual(queryData.decisions.length, 2);

    // 5. Test Conflict Resolution: Supersede
    const resolveRes = await fetch(`http://localhost:${port}/api/decisions/resolve-conflict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decisionId: fastifyDec.id,
        conflictingId: postgresDec.id,
        resolution: 'supersede'
      })
    });

    assert.strictEqual(resolveRes.status, 200);

    const updatedPostgres = repo.getDecisionById(postgresDec.id);
    assert.strictEqual(updatedPostgres?.state, 'Superseded');

    server.close();
    repo.close();
  });

  it('handles casual chatter with no decisions', async () => {
    const repo = new DecisionRepository(':memory:');
    const server = createServer(repo, new BackendExtractionEngine());
    await new Promise<void>(resolve => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const res = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMessages: [
          { author: 'wooddang', content: '오늘 점심 뭐 먹을까요?', createdAt: '2026-09-28T12:00:00Z' }
        ]
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.found, false);
    assert.strictEqual(data.decisions.length, 0);

    server.close();
    repo.close();
  });
});
