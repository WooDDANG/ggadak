import { test, expect, vi } from 'vitest';
import { isolatedRepository } from '../../apps/be/src/repositories/test-database.js';
import { SyncJobService } from '../../apps/be/src/services/sync-job.service.js';
import { SyncJobWorker } from '../../apps/bot/src/services/sync-job-worker.js';

test('Bot recovery scans only unfinished channels and persists accurate sync totals', async () => {
  const db = await isolatedRepository();
  try {
    await db.client.guild.create({ data: { id: 'worker', name: 'Worker' } });
    await db.client.monitoredChannel.createMany({
      data: [
        { id: 'a', guildId: 'worker', name: 'A' },
        { id: 'b', guildId: 'worker', name: 'B' },
      ],
    });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('worker', true);
    const first = (await jobs.claim())!;
    await jobs.update(job.jobId, {
      owner: first.owner,
      channelResult: {
        channelId: 'a',
        status: 'COMPLETED',
        messagesScanned: 10,
        decisionsFound: 1,
      },
    });
    await db.client.syncJob.update({ where: { id: job.jobId }, data: { leaseUntil: new Date(0) } });
    await db.client.$disconnect();
    const scanned: string[] = [];
    const worker = new SyncJobWorker(
      {
        claimSyncJob: () => jobs.claim(),
        updateSyncJob: (id, update) => jobs.update(id, update),
      },
      async (_job, channelId) => {
        scanned.push(channelId);
        return { scannedCount: 20, decisionsCount: 2 };
      },
    );
    await worker.runOnce();
    expect(scanned).toEqual(['b']);
    expect(await jobs.get(job.jobId, 'worker')).toMatchObject({
      status: 'COMPLETED',
      completedChannels: 2,
      failedChannels: 0,
      messagesScanned: 30,
      decisionsFound: 3,
    });
  } finally {
    await db.cleanup();
  }
});

test('a long Discord scan renews the lease and blocks a duplicate sync until completion', async () => {
  const db = await isolatedRepository();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
    await db.client.guild.create({ data: { id: 'long', name: 'Long' } });
    await db.client.monitoredChannel.create({ data: { id: 'c', guildId: 'long', name: 'C' } });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('long', false);
    let finishScan!: (result: { scannedCount: number; decisionsCount: number }) => void;
    let beganScan!: () => void;
    const began = new Promise<void>(resolve => {
      beganScan = resolve;
    });
    let renewal: Promise<void> = Promise.resolve();
    const worker = new SyncJobWorker(
      {
        claimSyncJob: () => jobs.claim(),
        updateSyncJob: (id, update) => {
          renewal = jobs.update(id, update);
          return renewal;
        },
      },
      () =>
        new Promise(resolve => {
          finishScan = resolve;
          beganScan();
        }),
    );
    const running = worker.runOnce();
    await began;
    for (let elapsed = 0; elapsed < 150_000; elapsed += 30_000) {
      await vi.advanceTimersByTimeAsync(30_000);
      await renewal;
    }
    expect(await jobs.claim()).toBeNull();
    await expect(jobs.create('long', false)).rejects.toMatchObject({ statusCode: 409 });
    finishScan({ scannedCount: 50, decisionsCount: 2 });
    await running;
    expect(await jobs.get(job.jobId, 'long')).toMatchObject({
      status: 'COMPLETED',
      completedChannels: 1,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect((await jobs.create('long', false)).status).toBe('QUEUED');
  } finally {
    vi.useRealTimers();
    await db.cleanup();
  }
});

test('a worker that loses its lease stops before scanning the next channel', async () => {
  const db = await isolatedRepository();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'));
    await db.client.guild.create({ data: { id: 'fence', name: 'Fence' } });
    await db.client.monitoredChannel.createMany({
      data: [
        { id: 'a', guildId: 'fence', name: 'A' },
        { id: 'b', guildId: 'fence', name: 'B' },
      ],
    });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('fence', false);
    const scanned: string[] = [];
    const worker = new SyncJobWorker(
      {
        claimSyncJob: () => jobs.claim(),
        updateSyncJob: (id, update) => jobs.update(id, update),
      },
      async (_job, channelId) => {
        scanned.push(channelId);
        vi.setSystemTime(new Date('2026-10-13T00:02:01Z'));
        expect((await jobs.claim())?.jobId).toBe(job.jobId);
        return { scannedCount: 10, decisionsCount: 1 };
      },
    );
    await expect(worker.runOnce()).rejects.toMatchObject({ statusCode: 409 });
    expect(scanned).toEqual(['a']);
    expect(await jobs.get(job.jobId, 'fence')).toMatchObject({
      status: 'PROCESSING',
      completedChannels: 0,
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    await db.cleanup();
  }
});

test('a sync with analysis still pending remains PROCESSING and resumes after lease recovery', async () => {
  const { ScanIncompleteError } = await import('../../apps/bot/src/services/harvester.service.js');
  const db = await isolatedRepository();
  try {
    await db.client.guild.create({ data: { id: 'pending-sync', name: 'Pending' } });
    await db.client.monitoredChannel.create({
      data: { id: 'pending-channel', guildId: 'pending-sync', name: 'Pending' },
    });
    const jobs = new SyncJobService(db.repo);
    const job = await jobs.create('pending-sync', true);
    let ready = false;
    const worker = new SyncJobWorker(
      { claimSyncJob: () => jobs.claim(), updateSyncJob: (id, update) => jobs.update(id, update) },
      async () => {
        if (!ready) throw new ScanIncompleteError(1, 1, 0, 'Analysis still running');
        return { scannedCount: 150, decisionsCount: 2 };
      },
    );
    await expect(worker.runOnce()).rejects.toBeInstanceOf(ScanIncompleteError);
    expect(await jobs.get(job.jobId, 'pending-sync')).toMatchObject({
      status: 'PROCESSING',
      failedChannels: 0,
      completedChannels: 0,
    });
    await db.client.syncJob.update({ where: { id: job.jobId }, data: { leaseUntil: new Date(0) } });
    ready = true;
    await worker.runOnce();
    expect(await jobs.get(job.jobId, 'pending-sync')).toMatchObject({
      status: 'COMPLETED',
      completedChannels: 1,
      failedChannels: 0,
      messagesScanned: 150,
      decisionsFound: 2,
    });
  } finally {
    await db.cleanup();
  }
});
