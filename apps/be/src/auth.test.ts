import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeAuthOptions, FakeDiscordAuth, loginAsTestUser } from './test-support/auth.js';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';

test('Discord login binds state to browser, rejects reuse, and returns server-scoped session', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  try {
    const start = await fetch(`${base}/auth/authorize`);
    assert.equal(start.status, 200);
    assert.ok(start.headers.get('set-cookie')?.includes('HttpOnly'));
    const login = await loginAsTestUser(base.replace('/api/v1', ''));
    const headers = { Authorization: `Bearer ${login.token}` };
    const guildResponse = await fetch(`${base}/auth/guilds`, { headers });
    assert.equal(guildResponse.status, 200);
    assert.deepEqual((await guildResponse.json() as any).data.guilds.map((g: any) => g.id), ['guild-1', 'guild-2']);
    const replay = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: login.cookie }, body: JSON.stringify({ code: 'valid-code', state: login.state }) });
    assert.equal(replay.status, 401);
    await db.repo.saveDecision({ id: 'DEC-1', topic: 'Architecture', decision: 'Use SQLite', rationale: 'Existing storage', state: 'Decided', actionItems: [], supersedesId: null, source: { guildId: 'guild-1', channelId: 'c1', triggerMessageId: 'm1', participants: [] }, createdAt: '2026-10-12T00:00:00Z' } as any);
    const list = await fetch(`${base}/decisions?guildId=guild-1`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json() as any).data.decisions[0].id, 'DEC-1');
    const denied = await fetch(`${base}/decisions?guildId=other-server`, { headers });
    assert.equal(denied.status, 403);
    const detail = await fetch(`${base}/decisions/DEC-1?guildId=guild-1`, { headers });
    assert.equal(detail.status, 200);
    assert.equal((await fetch(`${base}/decisions/DEC-1?guildId=guild-2`, { headers })).status, 403);
    assert.deepEqual((await (await fetch(`${base}/decisions?guildId=guild-2`, { headers })).json() as any).data.decisions, []);
    const tampered = login.token.slice(0, -3) + 'xyz';
    assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tampered}` } })).status, 401);
    const stolen = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'valid-code', state: new URL((await (await fetch(`${base}/auth/authorize`)).json() as any).data.url).searchParams.get('state') }) });
    assert.equal(stolen.status, 401);


  } finally { await new Promise<void>(r => server.close(() => r())); await db.cleanup(); }
});

test('Session refresh replaces revoked memberships; expired JWT and logout deny access after restart', async () => {
  const db = await isolatedRepository(); const discord = new FakeDiscordAuth(); let now = Date.now();
  const options = fakeAuthOptions(discord, () => now);
  let server = await createServer(db.repo, undefined, options);
  const listen = async () => { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); return `http://127.0.0.1:${(server.address() as any).port}`; };
  let base = await listen();
  try {
    const { token } = await loginAsTestUser(base); let headers = { Authorization: `Bearer ${token}` };
    await new Promise<void>(r => server.close(() => r()));
    server = await createServer(db.repo, undefined, options); base = await listen();
    assert.equal((await fetch(`${base}/api/v1/auth/me`, { headers })).status, 200);
    discord.availableGuilds = [discord.availableGuilds[1]];
    const refresh = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers });
    assert.equal(refresh.status, 200);
    const refreshed = (await refresh.json() as any).data.accessToken;
    headers = { Authorization: `Bearer ${refreshed}` };
    assert.equal((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/v1/decisions?guildId=guild-2`, { headers })).status, 200);
    now += 16 * 60000;
    assert.equal((await fetch(`${base}/api/v1/auth/me`, { headers })).status, 401);
    const relogin = await loginAsTestUser(base);
    headers = { Authorization: `Bearer ${relogin.token}` };
    assert.equal((await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/auth/me`, { headers })).status, 401);
  } finally { await new Promise<void>(r => server.close(() => r())); await db.cleanup(); }
});
