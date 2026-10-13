import { DecisionService } from '../src/services/decision.service.js';
import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import { SyncJobService } from '../src/services/sync-job.service.js';
import { DecisionSchema } from '@ggaddak/shared';

test('dashboard returns empty server metrics then reflects review, recent records and real sync progress without leaking another guild', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(r => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}` };
    const summary = async (guildId = 'guild-1') => {
      const response = await fetch(`${base}/api/v1/dashboard?guildId=${guildId}`, { headers });
      expect(response.status).toBe(200);
      return ((await response.json()) as any).data;
    };
    const empty = await summary();
    expect(empty.counts).toEqual({ confirmed: 0, onHold: 0, inReview: 0 });
    expect(empty.recentDecisions).toEqual([]);
    expect(empty.sync.lastSuccessfulAt).toBe(null);
    expect(empty.sync.latestJob).toBe(null);
    for (const [id, state, guildId, date] of [
      ['draft', 'Draft', 'guild-1', '2026-01-01'],
      ['held', 'Deferred', 'guild-1', '2026-01-02'],
      ['confirmed', 'Decided', 'guild-1', '2026-01-03'],
      ['historical', 'Superseded', 'guild-1', '2026-01-04'],
      ['private', 'Decided', 'guild-2', '2026-01-05'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          state,
          topic: id,
          decision: id,
          rationale: 'evidence',
          source: { guildId, channelId: 'c', triggerMessageId: 'm', participants: [] },
          createdAt: `${date}T00:00:00.000Z`,
        }),
      );
    let data = await summary();
    expect(data.counts).toEqual({ confirmed: 1, onHold: 1, inReview: 1 });
    expect(data.recentDecisions.map((d: any) => d.id)).toEqual(['confirmed']);
    await new DecisionService(db.repo).reviewDecision('draft', 'confirm', {
      expectedVersion: 1,
      resolution: 'independent',
    });
    data = await summary();
    expect(data.counts).toEqual({ confirmed: 2, onHold: 1, inReview: 0 });
    await db.client.monitoredChannel.create({
      data: { id: 'channel-sync', guildId: 'guild-1', name: 'Sync' },
    });
    const jobs = new SyncJobService(db.repo);
    const completed = await jobs.create('guild-1', false);
    const completedClaim = (await jobs.claim())!;
    await jobs.update(completed.jobId, {
      owner: completedClaim.owner,
      status: 'COMPLETED',
      channelResult: {
        channelId: 'channel-sync',
        status: 'COMPLETED',
        messagesScanned: 10,
        decisionsFound: 1,
      },
    });
    const successful = (await jobs.get(completed.jobId, 'guild-1')).completedAt;
    data = await summary();
    expect(data.sync.lastSuccessfulAt).toBe(successful);
    expect(data.sync.latestJob.status).toBe('COMPLETED');
    const active = await jobs.create('guild-1', false);
    data = await summary();
    expect(data.sync.latestJob.jobId).toBe(active.jobId);
    expect(data.sync.latestJob.status).toBe('QUEUED');
    expect(data.sync.lastSuccessfulAt).toBe(successful);
    const activeClaim = (await jobs.claim())!;
    data = await summary();
    expect(data.sync.latestJob.status).toBe('PROCESSING');
    await jobs.update(active.jobId, {
      owner: activeClaim.owner,
      status: 'FAILED',
      channelResult: {
        channelId: 'channel-sync',
        status: 'FAILED',
        messagesScanned: 0,
        decisionsFound: 0,
        errorMessage: 'AI unavailable',
      },
    });
    data = await summary();
    expect(data.sync.latestJob.status).toBe('FAILED');
    expect(data.sync.latestJob.errorMessage).toBe('AI unavailable');
    expect(data.sync.lastSuccessfulAt).toBe(successful);
    const other = await summary('guild-2');
    expect(other.sync.latestJob).toBe(null);
    expect(other.sync.lastSuccessfulAt).toBe(null);
    for (let index = 0; index < 6; index++)
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id: `recent-${index}`,
          state: 'Decided',
          topic: 'Recent',
          decision: 'Choice',
          rationale: 'Evidence',
          source: { guildId: 'guild-1', channelId: 'c', triggerMessageId: 'm', participants: [] },
          createdAt: '2026-01-01T00:00:00.000Z',
          decisionConfirmedDate: `2027-01-0${index + 1}T00:00:00.000Z`,
        }),
      );
    data = await summary();
    expect(data.recentDecisions.map((d: any) => d.id)).toEqual([
      'recent-5',
      'recent-4',
      'recent-3',
      'recent-2',
      'recent-1',
    ]);
    expect((await fetch(`${base}/api/v1/dashboard?guildId=guild-1`)).status).toBe(401);
    expect((await fetch(`${base}/api/v1/dashboard?guildId=unknown`, { headers })).status).toBe(403);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});
