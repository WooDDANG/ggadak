import 'reflect-metadata';
import { test, expect } from 'vitest';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { SyncJobService } from '../../src/services/sync-job.service.js';

test('manual sync is durable, rejects a duplicate active guild job, and releases its lock at completion', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.prisma.guild.create({ data: { id: 'guild-sync', name: 'Sync Guild' } });
    await db.repo.prisma.monitoredChannel.createMany({
      data: [
        { id: 'channel-b', guildId: 'guild-sync', name: 'B' },
        { id: 'channel-a', guildId: 'guild-sync', name: 'A' },
      ],
    });
    const jobs = new SyncJobService(db.repo);
    const accepted = await jobs.create('guild-sync', false);
    expect(accepted.status).toBe('QUEUED');
    expect(accepted.totalChannels).toBe(2);
    await expect(jobs.create('guild-sync', true)).rejects.toMatchObject({ statusCode: 409 });

    const claim = await jobs.claim();
    expect(claim.jobId).toBe(accepted.jobId);
    expect(claim.channelIds).toEqual(['channel-a', 'channel-b']);
    await jobs.update(accepted.jobId, {
      completedChannels: 2,
      decisionsFound: 1,
      messagesScanned: 18,
      status: 'COMPLETED',
    });
    expect((await jobs.get(accepted.jobId, 'guild-sync')).status).toBe('COMPLETED');

    const next = await jobs.create('guild-sync', true);
    expect(next.forceFullSync).toBe(true);
  } finally {
    await db.cleanup();
  }
});

test('a processing job with an expired lease can be reclaimed after Bot restart', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.prisma.guild.create({ data: { id: 'guild-restart', name: 'Restart Guild' } });
    await db.repo.prisma.monitoredChannel.create({
      data: { id: 'channel-1', guildId: 'guild-restart', name: 'one' },
    });
    const jobs = new SyncJobService(db.repo);
    const created = await jobs.create('guild-restart', false);
    await jobs.claim();
    await db.repo.prisma.syncJob.update({
      where: { id: created.jobId },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    expect((await jobs.claim()).jobId).toBe(created.jobId);
  } finally {
    await db.cleanup();
  }
});
