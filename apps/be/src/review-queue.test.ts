import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from './test-support/auth.js';
import { DecisionSchema } from '@ggaddak/shared';

test('authenticated reviewers process the same string-ID candidate with version checks and trusted identity', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    for (const [id, guildId] of [
      ['candidate', 'guild-1'],
      ['other', 'guild-2'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          topic: 'Architecture',
          decision: 'Use SQLite',
          rationale: 'Simple deployment',
          state: 'Draft',
          evidenceHash: `hash-${id}`,
          source: { guildId, channelId: 'c', triggerMessageId: 'm', participants: [] },
          createdAt: '2026-01-01T00:00:00Z',
        }),
      );
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const queue = `${base}/api/v1/review-queue?guildId=guild-1`;
    assert.equal((await fetch(queue)).status, 401);
    const first = await fetch(queue, { headers });
    assert.equal(first.status, 200);
    const item = ((await first.json()) as any).data.items[0];
    assert.equal(item.ticketId, 'candidate');
    assert.equal(item.id, 'candidate');
    const review = (id: string, body: object, guildId = 'guild-1') =>
      fetch(`${base}/api/v1/review-queue/${id}/review?guildId=${guildId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    assert.equal((await review('other', { action: 'confirm', expectedVersion: 1 })).status, 403);
    assert.equal(
      (await review('candidate', { action: 'confirm', expectedVersion: 8 })).status,
      409,
    );
    const confirmed = await review('candidate', {
      action: 'confirm',
      expectedVersion: 1,
      approvedBy: 'spoofed',
    });
    assert.equal(confirmed.status, 200);
    const result = ((await confirmed.json()) as any).data;
    assert.equal(result.status, 'CONFIRMED');
    assert.notEqual(result.approvedBy, 'spoofed');
    assert.ok(result.approvedBy);
    assert.ok(result.confirmedDate);
    assert.equal((await review('candidate', { action: 'reject', expectedVersion: 2 })).status, 409);
    const remaining = ((await (await fetch(queue, { headers })).json()) as any).data;
    assert.equal(remaining.items.length, 0);
    const detail = (
      (await (
        await fetch(`${base}/api/v1/decisions/candidate?guildId=guild-1`, { headers })
      ).json()) as any
    ).data;
    assert.equal(detail.confirmedDate, result.confirmedDate);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('review replacement is atomic, dispositions preserve completed history, and held/rejected candidates leave pending queue', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    for (const [id, state] of [
      ['old', 'Decided'],
      ['new', 'Draft'],
      ['held', 'Draft'],
      ['discarded', 'Draft'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          topic: 'Architecture',
          decision: 'SQLite',
          rationale: 'Local',
          state,
          evidenceHash: `hash-${id}`,
          source: { guildId: 'guild-1', channelId: 'c', triggerMessageId: 'm' },
          createdAt: '2026-01-01T00:00:00Z',
          actionItems:
            id === 'old'
              ? [
                  { id: 'open', task: 'Migrate', state: 'open' },
                  { id: 'done', task: 'Research', state: 'completed' },
                  { id: 'cancel', task: 'Buy license', state: 'unknown' },
                ]
              : [],
        }),
      );
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const review = (id: string, body: object) =>
      fetch(`${base}/api/v1/review-queue/${id}/review?guildId=guild-1`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    const detail = async (id: string) =>
      (
        (await (
          await fetch(`${base}/api/v1/decisions/${id}?guildId=guild-1`, { headers })
        ).json()) as any
      ).data;
    const replacement = {
      action: 'confirm',
      expectedVersion: 1,
      resolution: 'replace',
      predecessorId: 'old',
      predecessorVersion: 1,
    };
    assert.equal((await review('new', { ...replacement, predecessorVersion: 7 })).status, 409);
    assert.equal((await review('new', replacement)).status, 400);
    assert.equal((await detail('old')).status, 'CONFIRMED');
    assert.equal((await detail('new')).version, 1);
    const result = await review('new', {
      ...replacement,
      taskDispositions: [
        { actionItemId: 'open', disposition: 'transfer' },
        { actionItemId: 'cancel', classification: 'open', disposition: 'cancel' },
      ],
    });
    assert.equal(result.status, 200);
    const successor = ((await result.json()) as any).data;
    assert.equal(successor.supersedesId, 'old');
    assert.equal(successor.actionItems[0].transferredFromActionItemId, 'open');
    const predecessor = await detail('old');
    assert.equal(predecessor.status, 'SUPERSEDED');
    assert.equal(predecessor.supersededById, 'new');
    assert.equal(predecessor.version, 2);
    assert.deepEqual(
      predecessor.actionItems.map((task: any) => task.state),
      ['transferred', 'completed', 'canceled'],
    );
    assert.equal((await review('held', { action: 'defer', expectedVersion: 1 })).status, 200);
    const held = (
      (await (
        await fetch(`${base}/api/v1/review-queue?guildId=guild-1&status=ON_HOLD`, { headers })
      ).json()) as any
    ).data;
    assert.equal(held.items[0].ticketId, 'held');
    assert.equal(held.items[0].version, 2);
    assert.equal((await review('held', { action: 'confirm', expectedVersion: 1 })).status, 409);
    assert.equal((await review('held', { action: 'confirm', expectedVersion: 2 })).status, 200);
    assert.equal((await review('discarded', { action: 'reject', expectedVersion: 1 })).status, 200);
    assert.equal((await detail('discarded')).status, 'DISCARDED');
    assert.equal(await db.repo.isEvidenceRejected('hash-discarded'), true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
