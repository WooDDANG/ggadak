import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolatedRepository } from '../repositories/test-database.js';
import { SyncJobService } from './sync-job.service.js';

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
    assert.equal(accepted.status, 'QUEUED');
    assert.equal(accepted.totalChannels, 2);
    await assert.rejects(jobs.create('guild-sync', true), (error: any) => error.statusCode === 409);

    const claim = await jobs.claim();
    assert.equal(claim.jobId, accepted.jobId);
    assert.deepEqual(claim.channelIds, ['channel-a', 'channel-b']);
    await jobs.update(accepted.jobId, {
      completedChannels: 2,
      decisionsFound: 1,
      messagesScanned: 18,
      status: 'COMPLETED',
    });
    assert.equal((await jobs.get(accepted.jobId, 'guild-sync')).status, 'COMPLETED');

    const next = await jobs.create('guild-sync', true);
    assert.equal(next.forceFullSync, true);
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
    assert.equal((await jobs.claim()).jobId, created.jobId);
  } finally {
    await db.cleanup();
  }
});
