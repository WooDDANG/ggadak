import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from './test-support/auth.js';

test('Monitoring settings authorize guild managers, validate Discord channels, and survive restart', async () => {
  const db = await isolatedRepository();
  let accessible = true;
  const options = { ...fakeAuthOptions(), serviceToken: 'test-service-token', channelAdapter: {
    list: async (guildId: string) => [{ id: 'c1', guildId, name: 'decisions', type: 0, accessible }],
  } };
  let server = await createServer(db.repo, undefined, options as any);
  const listen = async () => { await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${(server.address() as any).port}`; };
  let base = await listen();
  try {
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const save = async (guildId: string, ids: string[]) => fetch(`${base}/api/v1/discord/channels?guildId=${guildId}`, { method: 'PUT', headers, body: JSON.stringify({ channelIds: ids }) });
    assert.equal((await save('guild-1', ['c1'])).status, 200);
    assert.equal((await save('guild-2', ['c1'])).status, 403);
    assert.equal((await save('guild-1', ['other-server-channel'])).status, 400);
    const get = async () => (await (await fetch(`${base}/api/v1/discord/channels?guildId=guild-1`, { headers })).json() as any).data;
    assert.deepEqual((await get()).monitoredChannelIds, ['c1']);
    await new Promise<void>(r => server.close(() => r()));
    server = await createServer(db.repo, undefined, options as any); base = await listen();
    assert.deepEqual((await get()).monitoredChannelIds, ['c1']);
    assert.equal((await fetch(`${base}/api/v1/internal/monitoring?guildId=guild-1`)).status, 401);
    const monitored = async () => (await (await fetch(`${base}/api/v1/internal/monitoring?guildId=guild-1`, { headers: { Authorization: 'Bearer test-service-token' } })).json() as any).data.channelIds;
    assert.deepEqual(await monitored(), ['c1']);
    accessible = false;
    assert.deepEqual(await monitored(), []);
    assert.equal((await save('guild-1', ['c1'])).status, 400);
    assert.deepEqual((await get()).monitoredChannelIds, ['c1']);
  } finally { await new Promise<void>(r => server.close(() => r())); await db.cleanup(); }
});
