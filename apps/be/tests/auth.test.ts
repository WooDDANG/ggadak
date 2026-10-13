import { DecisionSchema } from '@ggaddak/shared';
import { test, expect, vi } from 'vitest';
import { AuthService } from '../src/services/auth.service.js';
import { fakeAuthOptions, FakeDiscordAuth, loginAsTestUser } from '../src/test-support/auth.js';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';

test('Discord login binds state to browser, rejects reuse, and returns server-scoped session', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  try {
    const start = await fetch(`${base}/auth/authorize`);
    expect(start.status).toBe(200);
    expect(start.headers.get('set-cookie')?.includes('HttpOnly')).toBeTruthy();
    const login = await loginAsTestUser(base.replace('/api/v1', ''));
    const headers = { Authorization: `Bearer ${login.token}` };
    const guildResponse = await fetch(`${base}/auth/guilds`, { headers });
    expect(guildResponse.status).toBe(200);
    expect(((await guildResponse.json()) as any).data.guilds.map((g: any) => g.id)).toEqual([
      'guild-1',
      'guild-2',
    ]);
    const replay = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: login.cookie },
      body: JSON.stringify({ code: 'valid-code', state: login.state }),
    });
    expect(replay.status).toBe(401);
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'DEC-1',
        topic: 'Architecture',
        decision: 'Use SQLite',
        rationale: 'Existing storage',
        state: 'Decided',
        actionItems: [],
        supersedesId: null,
        source: { guildId: 'guild-1', channelId: 'c1', triggerMessageId: 'm1', participants: [] },
        createdAt: '2026-10-12T00:00:00Z',
      }),
    );
    const list = await fetch(`${base}/decisions?guildId=guild-1`, { headers });
    expect(list.status).toBe(200);
    expect(((await list.json()) as any).data.decisions[0].id).toBe('DEC-1');
    const denied = await fetch(`${base}/decisions?guildId=other-server`, { headers });
    expect(denied.status).toBe(403);
    const detail = await fetch(`${base}/decisions/DEC-1?guildId=guild-1`, { headers });
    expect(detail.status).toBe(200);
    expect((await fetch(`${base}/decisions/DEC-1?guildId=guild-2`, { headers })).status).toBe(403);
    expect(
      ((await (await fetch(`${base}/decisions?guildId=guild-2`, { headers })).json()) as any).data
        .decisions,
    ).toEqual([]);
    const tampered = login.token.slice(0, -3) + 'xyz';
    expect(
      (await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tampered}` } })).status,
    ).toBe(401);
    const stolen = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'valid-code',
        state: new URL(
          ((await (await fetch(`${base}/auth/authorize`)).json()) as any).data.url,
        ).searchParams.get('state'),
      }),
    });
    expect(stolen.status).toBe(401);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});

test('Session refresh replaces revoked memberships; expired JWT and logout deny access after restart', async () => {
  const db = await isolatedRepository();
  const discord = new FakeDiscordAuth();
  let now = Date.now();
  const options = fakeAuthOptions(discord, () => now);
  let server = await createServer(db.repo, undefined, options);
  const listen = async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${(server.address() as any).port}`;
  };
  let base = await listen();
  try {
    const { token } = await loginAsTestUser(base);
    let headers = { Authorization: `Bearer ${token}` };
    await new Promise<void>(r => server.close(() => r()));
    server = await createServer(db.repo, undefined, options);
    base = await listen();
    expect((await fetch(`${base}/api/v1/auth/me`, { headers })).status).toBe(200);
    discord.availableGuilds = [discord.availableGuilds[1]];
    const refresh = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers });
    expect(refresh.status).toBe(200);
    const refreshed = ((await refresh.json()) as any).data.accessToken;
    headers = { Authorization: `Bearer ${refreshed}` };
    expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(403);
    expect((await fetch(`${base}/api/v1/decisions?guildId=guild-2`, { headers })).status).toBe(200);
    now += 16 * 60000;
    expect((await fetch(`${base}/api/v1/auth/me`, { headers })).status).toBe(401);
    const relogin = await loginAsTestUser(base);
    headers = { Authorization: `Bearer ${relogin.token}` };
    expect((await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers })).status).toBe(
      200,
    );
    expect((await fetch(`${base}/api/v1/auth/me`, { headers })).status).toBe(401);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});

test('default auth reads environment loaded by the entrypoint after module imports', async () => {
  const db = await isolatedRepository();
  try {
    vi.stubEnv('DISCORD_CLIENT_ID', 'entrypoint-client');
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'entrypoint-secret');
    vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:5173/callback');
    vi.stubEnv('AUTH_SECRET', '0123456789abcdef0123456789abcdef');
    const result = await new AuthService(db.client).authorize();
    expect(new URL(result.url).searchParams.get('client_id')).toBe('entrypoint-client');
    expect(new URL(result.url).searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/callback',
    );
  } finally {
    vi.unstubAllEnvs();
    await db.cleanup();
  }
});
