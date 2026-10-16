import { test, expect } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { createServer } from '../src/server.js';
import { fakeAuthOptions, testAuthConfig, FakeDiscordAuth } from '../src/test-support/auth.js';

test('browser cookie restores expired access tokens after restart, expires after seven days and logout revokes it', async () => {
  const db = await isolatedRepository();
  let now = Date.now();
  const loggedInAt = now;
  const options = fakeAuthOptions(new FakeDiscordAuth(), () => now);
  let server = await createServer(db.repo, undefined, options);
  const listen = async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${(server.address() as any).port}`;
  };
  let base = await listen();
  const origin = new URL(testAuthConfig.redirectUri).origin;
  try {
    const start = await fetch(`${base}/api/v1/auth/authorize`);
    const state = new URL(((await start.json()) as any).data.url).searchParams.get('state');
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: start.headers.get('set-cookie')!.split(';')[0],
        Origin: origin,
      },
      body: JSON.stringify({ code: 'valid-code', state }),
    });
    expect(login.status).toBe(200);
    const sessionCookie = login.headers
      .getSetCookie()
      .find(value => value.startsWith('ggaddak_session='));
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Max-Age=604800');
    const cookie = sessionCookie!.split(';')[0];
    const original = ((await login.json()) as any).data;
    expect(original.sessionCookie).toBeUndefined();
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = await createServer(db.repo, undefined, options);
    base = await listen();
    now += 16 * 60000;
    const restore = () =>
      fetch(`${base}/api/v1/auth/session`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin },
      });
    const restored = await restore();
    expect(restored.status).toBe(200);
    const data = ((await restored.json()) as any).data;
    expect(data.user.discordUserId).toBe('user-1');
    expect(data.guilds).toHaveLength(2);
    expect(
      (
        await fetch(`${base}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(`${base}/api/v1/auth/session`, {
          method: 'POST',
          headers: { Cookie: cookie, Origin: 'https://attacker.example' },
        })
      ).status,
    ).toBe(403);
    now = loggedInAt + 7 * 86400000 + 1000;
    expect((await restore()).status).toBe(401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('browser logout revokes only its session, concurrent restores share refresh, and transient failures retain rotated credentials', async () => {
  const { AppError } = await import('../src/errors/AppError.js');
  const db = await isolatedRepository();
  let now = Date.now();
  let guildFailure = false;
  let refreshCalls = 0;
  let expectedCredential = 'fake-refresh';
  class RotatingDiscord extends FakeDiscordAuth {
    override async refresh(token?: string) {
      refreshCalls++;
      expect(token).toBe(expectedCredential);
      await new Promise(resolve => setTimeout(resolve, 40));
      expectedCredential = `rotation-${refreshCalls}`;
      return { access_token: 'fake-access', refresh_token: expectedCredential, expires_in: 3600 };
    }
    override async guilds() {
      if (guildFailure) throw new AppError('temporary Discord outage', 502);
      return super.guilds();
    }
  }
  const discord = new RotatingDiscord();
  const server = await createServer(
    db.repo,
    undefined,
    fakeAuthOptions(discord, () => now),
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1/auth`;
  const origin = new URL(testAuthConfig.redirectUri).origin;
  const login = async () => {
    const start = await fetch(`${base}/authorize`);
    const state = new URL(((await start.json()) as any).data.url).searchParams.get('state');
    const result = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: start.headers.get('set-cookie')!.split(';')[0],
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: 'valid-code', state }),
    });
    return result.headers
      .getSetCookie()
      .find(value => value.startsWith('ggaddak_session='))!
      .split(';')[0];
  };
  try {
    const cookie = await login();
    const otherCookie = await login();
    const restore = (value = cookie, source = origin) =>
      fetch(`${base}/session`, { method: 'POST', headers: { Cookie: value, Origin: source } });
    const concurrent = await Promise.all([restore(), restore()]);
    expect(concurrent.map(result => result.status)).toEqual([200, 200]);
    expect(refreshCalls).toBe(1);
    guildFailure = true;
    expect((await restore()).status).toBe(502);
    guildFailure = false;
    discord.availableGuilds = [discord.availableGuilds[1]];
    const recovered = await restore();
    expect(recovered.status).toBe(200);
    expect(((await recovered.json()) as any).data.guilds.map((guild: any) => guild.id)).toEqual([
      'guild-2',
    ]);
    expect((await restore(cookie + 'tampered')).status).toBe(401);
    expect((await restore(cookie, 'null')).status).toBe(403);
    expect(
      (
        await fetch(`${base}/logout`, {
          method: 'POST',
          headers: { Cookie: cookie, Origin: 'https://attacker.example' },
        })
      ).status,
    ).toBe(403);
    const logout = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await restore()).status).toBe(401);
    // Another browser's independent cookie remains valid; its refresh credential was not rotated above.
    expectedCredential = 'fake-refresh';
    expect((await restore(otherCookie)).status).toBe(200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
