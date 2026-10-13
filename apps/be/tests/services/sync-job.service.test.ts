import 'reflect-metadata';
import { test, expect, vi } from 'vitest';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { SyncJobService } from '../../src/services/sync-job.service.js';

test('reclaimed sync preserves each completed channel once and replaces a recovered failure', async () => {
  const db = await isolatedRepository();
  try {
    await db.client.guild.create({ data: { id: 'resume', name: 'Resume' } });
    await db.client.monitoredChannel.createMany({
      data: [
        { id: 'a', guildId: 'resume', name: 'A' },
        { id: 'b', guildId: 'resume', name: 'B' },
      ],
    });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('resume', true);
    const first = (await jobs.claim())!;
    const result = {
      channelId: 'a',
      status: 'COMPLETED' as const,
      messagesScanned: 10,
      decisionsFound: 1,
    };
    await jobs.update(job.jobId, { owner: first.owner, channelResult: result });
    await jobs.update(job.jobId, { owner: first.owner, channelResult: result });
    await jobs.update(job.jobId, {
      owner: first.owner,
      channelResult: {
        channelId: 'b',
        status: 'FAILED',
        messagesScanned: 0,
        decisionsFound: 0,
      },
    });
    await db.client.$disconnect();
    await db.client.syncJob.update({ where: { id: job.jobId }, data: { leaseUntil: new Date(0) } });
    const restarted = new SyncJobService(db.repo);
    const claim = (await restarted.claim())!;
    expect(claim.channelIds).toEqual(['b']);
    await restarted.update(job.jobId, {
      owner: claim.owner,
      channelResult: {
        channelId: 'b',
        status: 'COMPLETED',
        messagesScanned: 20,
        decisionsFound: 2,
      },
    });
    await restarted.update(job.jobId, { owner: claim.owner, status: 'COMPLETED' });
    expect(await restarted.get(job.jobId, 'resume')).toMatchObject({
      status: 'COMPLETED',
      totalChannels: 2,
      completedChannels: 2,
      failedChannels: 0,
      messagesScanned: 30,
      decisionsFound: 3,
    });
  } finally {
    await db.cleanup();
  }
});

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

    const claim = (await jobs.claim())!;
    expect(claim.jobId).toBe(accepted.jobId);
    expect(claim.channelIds).toEqual(['channel-a', 'channel-b']);
    for (const channelId of claim.channelIds)
      await jobs.update(accepted.jobId, {
        owner: claim.owner,
        channelResult: {
          channelId,
          status: 'COMPLETED',
          messagesScanned: 9,
          decisionsFound: 0,
        },
      });
    await jobs.update(accepted.jobId, { owner: claim.owner, status: 'COMPLETED' });
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
    expect((await jobs.claim())!.jobId).toBe(created.jobId);
  } finally {
    await db.cleanup();
  }
});

test('expired sync keeps its guild lock and fences the worker replaced by a new claim', async () => {
  const db = await isolatedRepository();
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
    await db.client.guild.create({ data: { id: 'lease', name: 'Lease' } });
    await db.client.monitoredChannel.create({
      data: { id: 'lease-channel', guildId: 'lease', name: 'one' },
    });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('lease', false);
    const first = (await jobs.claim())!;
    vi.setSystemTime(new Date('2026-10-13T00:02:01Z'));
    await expect(jobs.create('lease', true)).rejects.toMatchObject({ statusCode: 409 });
    const second = (await jobs.claim())!;
    expect(second.jobId).toBe(job.jobId);
    expect(second.owner).not.toBe(first.owner);
    await expect(
      jobs.update(job.jobId, { owner: first.owner, status: 'COMPLETED' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(jobs.update(job.jobId, { owner: first.owner })).rejects.toMatchObject({
      statusCode: 409,
    });
    await jobs.update(job.jobId, { owner: second.owner });
    vi.setSystemTime(new Date('2026-10-13T00:03:59Z'));
    expect(await jobs.claim()).toBeNull();
    expect(await jobs.get(job.jobId, 'lease')).toMatchObject({
      status: 'PROCESSING',
      completedChannels: 0,
    });
  } finally {
    vi.useRealTimers();
    await db.cleanup();
  }
});

test('one worker claims each sync while other guilds remain eligible and unfinished jobs cannot finish', async () => {
  const db = await isolatedRepository();
  try {
    for (const guildId of ['one', 'two']) {
      await db.client.guild.create({ data: { id: guildId, name: guildId } });
      await db.client.monitoredChannel.create({
        data: { id: `${guildId}-channel`, guildId, name: 'C' },
      });
    }
    const jobs = new SyncJobService(db.repo);
    const first = await jobs.create('one', false);
    const claims = await Promise.all([jobs.claim(), jobs.claim()]);
    const successful = claims.filter(claim => claim !== null);
    expect(successful).toHaveLength(1);
    const claim = successful[0]!;
    await expect(
      jobs.update(first.jobId, { owner: claim.owner, status: 'COMPLETED' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      jobs.update(first.jobId, {
        owner: claim.owner,
        channelResult: {
          channelId: 'foreign',
          status: 'COMPLETED',
          messagesScanned: 0,
          decisionsFound: 0,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const other = await jobs.create('two', false);
    expect((await jobs.claim())?.jobId).toBe(other.jobId);
    expect(await jobs.get(first.jobId, 'one')).toMatchObject({
      status: 'PROCESSING',
      completedChannels: 0,
    });
  } finally {
    await db.cleanup();
  }
});
