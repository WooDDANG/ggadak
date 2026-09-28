import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from './server.js';
import { DecisionRepository } from './db.js';

describe('BE Server & Ingestion API', () => {
  let server: http.Server;
  let repo: DecisionRepository;
  let port: number;

  before(async () => {
    repo = new DecisionRepository(':memory:');
    server = createServer(repo);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        repo.close();
        resolve();
      });
    });
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
          participants: ['wooddang']
        },
        createdAt: '2026-09-28T14:20:00.000Z'
      }
    };

    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json() as any;
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.id, 'DEC-101');

    // Verify stored
    const stored = repo.getDecisionById('DEC-101');
    assert.ok(stored);
    assert.strictEqual(stored.decision, 'Split into 3-tier monorepo');
  });

  it('queries decision list via GET /api/decisions', async () => {
    const res = await fetch(`http://localhost:${port}/api/decisions`);
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.ok(Array.isArray(data.decisions));
    assert.strictEqual(data.decisions.length, 1);
  });

  it('handles superseding previous decisions when a supersedesId is provided', async () => {
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
          participants: ['wooddang']
        },
        createdAt: '2026-09-28T14:25:00.000Z'
      }
    };

    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload2)
    });
    assert.strictEqual(res.status, 201);

    // Verify DEC-101 is now Superseded and DEC-102 is Decided
    const dec1 = repo.getDecisionById('DEC-101');
    const dec2 = repo.getDecisionById('DEC-102');
    assert.strictEqual(dec1?.state, 'Superseded');
    assert.strictEqual(dec2?.state, 'Decided');
  });

  it('rejects invalid payload format', async () => {
    const res = await fetch(`http://localhost:${port}/api/webhooks/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' })
    });
    assert.strictEqual(res.status, 400);
  });
});
