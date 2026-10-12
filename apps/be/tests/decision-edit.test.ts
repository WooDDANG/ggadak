import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from '../src/repositories/decision.repository.js';
import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
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
    expect(put.status).toBe(200);
    const edited = ((await put.json()) as any).data;
    expect(edited.title).toBe('Updated');
    expect(edited.status).toBe('CONFIRMED');
    expect(edited.version).toBe(2);
    expect(edited.updatedAt).toBeTruthy();
    expect(edited.alternatives[0].id).toBeTruthy();
    expect((await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) })).status).toBe(
      409,
    );
    expect(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...body, expectedVersion: 2, status: 'DISCARDED' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...body, expectedVersion: 2, title: ' ' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(url.replace('guild-1', 'guild-2'), {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(403);
    const read = ((await (await fetch(url, { headers })).json()) as any).data;
    expect(read.decision).toBe('Use OAuth');
    expect(read.alternatives[0].id).toBe(edited.alternatives[0].id);
    const retained = {
      ...body,
      expectedVersion: 2,
      alternatives: [
        { ...edited.alternatives[0], name: 'Company email' },
        { name: 'SSO', reason: 'Enterprise setup' },
      ],
    };
    const amended = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(retained) });
    expect(amended.status).toBe(200);
    const latest = ((await amended.json()) as any).data;
    expect(latest.alternatives[0].id).toBe(edited.alternatives[0].id);
    expect(latest.alternatives[1].id).not.toBe(latest.alternatives[0].id);
    expect(
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
    ).toBe(400);
    expect(
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
    ).toBe(400);
    expect(
      (
        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...retained, expectedVersion: 3, title: 'x'.repeat(201) }),
        })
      ).status,
    ).toBe(400);
    const removal = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...retained,
        expectedVersion: 3,
        alternatives: [latest.alternatives[1]],
      }),
    });
    expect(removal.status).toBe(200);
    const restartedClient = new PrismaClient({ datasources: { db: { url: db.url } } });
    try {
      const restored = await new DecisionRepository(restartedClient).getDecisionById('edit');
      expect(restored?.title).toBe('Updated');
      expect(restored?.version).toBe(4);
      expect(restored?.alternatives.length).toBe(1);
      expect(restored?.alternatives[0].option).toBe('SSO');
    } finally {
      await restartedClient.$disconnect();
    }
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});
