import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';

test('Sync Job API returns 202, scopes status to guild membership, and exposes worker claim/update only to Bot', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, {
    ...fakeAuthOptions(),
    serviceToken: 'sync-worker-secret',
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const { token } = await loginAsTestUser(base);
    const user = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    await db.repo.prisma.monitoredChannel.create({
      data: { id: 'sync-channel', guildId: 'guild-1', name: 'sync' },
    });
    const accepted = await fetch(`${base}/api/v1/sync-jobs?guildId=guild-1`, {
      method: 'POST',
      headers: user,
      body: '{}',
    });
    expect(accepted.status).toBe(202);
    const job = ((await accepted.json()) as any).data;
    expect(job.status).toBe('QUEUED');
    expect(job.totalChannels).toBe(1);
    expect(
      (await fetch(`${base}/api/v1/sync-jobs/${job.jobId}?guildId=guild-2`, { headers: user }))
        .status,
    ).toBe(404);
    expect(
      (
        await fetch(`${base}/api/v1/sync-jobs?guildId=guild-1`, {
          method: 'POST',
          headers: user,
          body: '{"forceFullSync":true}',
        })
      ).status,
    ).toBe(409);

    expect(
      (await fetch(`${base}/api/v1/internal/sync-jobs/claim`, { method: 'POST' })).status,
    ).toBe(401);
    const bot = { Authorization: 'Bearer sync-worker-secret', 'Content-Type': 'application/json' };
    const claimed = await fetch(`${base}/api/v1/internal/sync-jobs/claim`, {
      method: 'POST',
      headers: bot,
      body: '{}',
    });
    expect(claimed.status).toBe(200);
    const claim = ((await claimed.json()) as any).data;
    expect(claim.jobId).toBe(job.jobId);
    const update = await fetch(`${base}/api/v1/internal/sync-jobs/${job.jobId}`, {
      method: 'PUT',
      headers: bot,
      body: JSON.stringify({
        owner: claim.owner,
        status: 'COMPLETED',
        channelResult: {
          channelId: 'sync-channel',
          status: 'COMPLETED',
          messagesScanned: 10,
          decisionsFound: 1,
        },
      }),
    });
    expect(update.status).toBe(200);
    expect(
      (
        (await (
          await fetch(`${base}/api/v1/sync-jobs/${job.jobId}?guildId=guild-1`, { headers: user })
        ).json()) as any
      ).data.status,
    ).toBe('COMPLETED');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
