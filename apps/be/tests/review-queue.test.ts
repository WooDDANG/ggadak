import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
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
    expect((await fetch(queue)).status).toBe(401);
    const first = await fetch(queue, { headers });
    expect(first.status).toBe(200);
    const item = ((await first.json()) as any).data.items[0];
    expect(item.ticketId).toBe('candidate');
    expect(item.id).toBe('candidate');
    const review = (id: string, body: object, guildId = 'guild-1') =>
      fetch(`${base}/api/v1/review-queue/${id}/review?guildId=${guildId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    expect((await review('other', { action: 'confirm', expectedVersion: 1 })).status).toBe(403);
    expect((await review('candidate', { action: 'confirm', expectedVersion: 8 })).status).toBe(409);
    const confirmed = await review('candidate', {
      action: 'confirm',
      expectedVersion: 1,
      approvedBy: 'spoofed',
    });
    expect(confirmed.status).toBe(200);
    const result = ((await confirmed.json()) as any).data;
    expect(result.status).toBe('CONFIRMED');
    expect(result.approvedBy).not.toBe('spoofed');
    expect(result.approvedBy).toBeTruthy();
    expect(result.confirmedDate).toBeTruthy();
    expect((await review('candidate', { action: 'reject', expectedVersion: 2 })).status).toBe(409);
    const remaining = ((await (await fetch(queue, { headers })).json()) as any).data;
    expect(remaining.items.length).toBe(0);
    const detail = (
      (await (
        await fetch(`${base}/api/v1/decisions/candidate?guildId=guild-1`, { headers })
      ).json()) as any
    ).data;
    expect(detail.confirmedDate).toBe(result.confirmedDate);
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
    expect((await review('new', { ...replacement, predecessorVersion: 7 })).status).toBe(409);
    expect((await review('new', replacement)).status).toBe(400);
    expect((await detail('old')).status).toBe('CONFIRMED');
    expect((await detail('new')).version).toBe(1);
    const result = await review('new', {
      ...replacement,
      taskDispositions: [
        { actionItemId: 'open', disposition: 'transfer' },
        { actionItemId: 'cancel', classification: 'open', disposition: 'cancel' },
      ],
    });
    expect(result.status).toBe(200);
    const successor = ((await result.json()) as any).data;
    expect(successor.supersedesId).toBe('old');
    expect(successor.actionItems[0].transferredFromActionItemId).toBe('open');
    const predecessor = await detail('old');
    expect(predecessor.status).toBe('SUPERSEDED');
    expect(predecessor.supersededById).toBe('new');
    expect(predecessor.version).toBe(2);
    expect(predecessor.actionItems.map((task: any) => task.state)).toEqual([
      'transferred',
      'completed',
      'canceled',
    ]);
    expect((await review('held', { action: 'defer', expectedVersion: 1 })).status).toBe(200);
    const held = (
      (await (
        await fetch(`${base}/api/v1/review-queue?guildId=guild-1&status=ON_HOLD`, { headers })
      ).json()) as any
    ).data;
    expect(held.items[0].ticketId).toBe('held');
    expect(held.items[0].version).toBe(2);
    expect((await review('held', { action: 'confirm', expectedVersion: 1 })).status).toBe(409);
    expect((await review('held', { action: 'confirm', expectedVersion: 2 })).status).toBe(200);
    expect((await review('discarded', { action: 'reject', expectedVersion: 1 })).status).toBe(200);
    expect((await detail('discarded')).status).toBe('DISCARDED');
    expect(await db.repo.isEvidenceRejected('hash-discarded')).toBe(true);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
