import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from './test-support/auth.js';

test('Sync Job API returns 202, scopes status to guild membership, and exposes worker claim/update only to Bot', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, { ...fakeAuthOptions(), serviceToken: 'sync-worker-secret' });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const { token } = await loginAsTestUser(base);
    const user = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    await db.repo.prisma.monitoredChannel.create({ data: { id: 'sync-channel', guildId: 'guild-1', name: 'sync' } });
    const accepted = await fetch(`${base}/api/v1/sync-jobs?guildId=guild-1`, { method: 'POST', headers: user, body: '{}' });
    assert.equal(accepted.status, 202);
    const job = (await accepted.json() as any).data;
    assert.equal(job.status, 'QUEUED');
    assert.equal(job.totalChannels, 1);
    assert.equal((await fetch(`${base}/api/v1/sync-jobs/${job.jobId}?guildId=guild-2`, { headers: user })).status, 404);
    assert.equal((await fetch(`${base}/api/v1/sync-jobs?guildId=guild-1`, { method: 'POST', headers: user, body: '{"forceFullSync":true}' })).status, 409);

    assert.equal((await fetch(`${base}/api/v1/internal/sync-jobs/claim`, { method: 'POST' })).status, 401);
    const bot = { Authorization: 'Bearer sync-worker-secret', 'Content-Type': 'application/json' };
    const claimed = await fetch(`${base}/api/v1/internal/sync-jobs/claim`, { method: 'POST', headers: bot, body: '{}' });
    assert.equal(claimed.status, 200);
    assert.equal((await claimed.json() as any).data.jobId, job.jobId);
    const update = await fetch(`${base}/api/v1/internal/sync-jobs/${job.jobId}`, {
      method: 'PUT', headers: bot, body: JSON.stringify({ status: 'COMPLETED', completedChannels: 1 }),
    });
    assert.equal(update.status, 200);
    assert.equal((await (await fetch(`${base}/api/v1/sync-jobs/${job.jobId}?guildId=guild-1`, { headers: user })).json() as any).data.status, 'COMPLETED');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
