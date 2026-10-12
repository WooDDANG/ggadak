import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from './repositories/decision.repository.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from './test-support/auth.js';
import { DecisionSchema } from '@ggaddak/shared';

test('versioned card edit persists content without changing review state', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(r => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'edit',
        topic: 'Auth',
        title: 'Original',
        decision: 'Discord',
        rationale: 'Identity',
        state: 'Decided',
        source: { guildId: 'guild-1', channelId: 'c', triggerMessageId: 'm', participants: [] },
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const url = `${base}/api/v1/decisions/edit?guildId=guild-1`;
    const body = {
      expectedVersion: 1,
      title: 'Updated',
      decision: 'Use OAuth',
      rationale: 'Server identity',
      category: '기술',
      alternatives: [{ name: 'Email', reason: 'Manual mapping' }],
    };
    const put = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
    assert.equal(put.status, 200);
    const edited = ((await put.json()) as any).data;
    assert.equal(edited.title, 'Updated');
    assert.equal(edited.status, 'CONFIRMED');
    assert.equal(edited.version, 2);
    assert.ok(edited.updatedAt);
    assert.ok(edited.alternatives[0].id);
    assert.equal(
      (await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) })).status,
      409,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...body, expectedVersion: 2, status: 'DISCARDED' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...body, expectedVersion: 2, title: ' ' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(url.replace('guild-1', 'guild-2'), {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
    const read = ((await (await fetch(url, { headers })).json()) as any).data;
    assert.equal(read.decision, 'Use OAuth');
    assert.equal(read.alternatives[0].id, edited.alternatives[0].id);
    const retained = {
      ...body,
      expectedVersion: 2,
      alternatives: [
        { ...edited.alternatives[0], name: 'Company email' },
        { name: 'SSO', reason: 'Enterprise setup' },
      ],
    };
    const amended = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(retained) });
    assert.equal(amended.status, 200);
    const latest = ((await amended.json()) as any).data;
    assert.equal(latest.alternatives[0].id, edited.alternatives[0].id);
    assert.notEqual(latest.alternatives[1].id, latest.alternatives[0].id);
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            ...retained,
            expectedVersion: 3,
            alternatives: [{ id: 'foreign', name: 'X', reason: 'Y' }],
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            ...retained,
            expectedVersion: 3,
            alternatives: [latest.alternatives[0], latest.alternatives[0]],
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...retained, expectedVersion: 3, title: 'x'.repeat(201) }),
        })
      ).status,
      400,
    );
    const removal = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...retained,
        expectedVersion: 3,
        alternatives: [latest.alternatives[1]],
      }),
    });
    assert.equal(removal.status, 200);
    const restartedClient = new PrismaClient({ datasources: { db: { url: db.url } } });
    try {
      const restored = await new DecisionRepository(restartedClient).getDecisionById('edit');
      assert.equal(restored?.title, 'Updated');
      assert.equal(restored?.version, 4);
      assert.equal(restored?.alternatives.length, 1);
      assert.equal(restored?.alternatives[0].option, 'SSO');
    } finally {
      await restartedClient.$disconnect();
    }
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});
