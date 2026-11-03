import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import {
  FakeDiscordAuth,
  fakeAuthOptions,
  loginAsTestUser,
  testAuthConfig,
} from '../src/test-support/auth.js';
import { AppError } from '../src/errors/AppError.js';
import { DecisionSchema, GuildAccessPolicy } from '@ggaddak/shared';

class ObservableDiscord extends FakeDiscordAuth {
  guildCalls = 0;
  unavailable = false;
  pending?: { started: () => void; released: Promise<void> };
  override async guilds() {
    this.guildCalls++;
    if (this.unavailable) throw new AppError('Discord is unavailable', 502);
    const result = [...this.availableGuilds];
    if (this.pending) {
      this.pending.started();
      await this.pending.released;
      this.pending = undefined;
    }
    return result;
  }
}

class TwoUsersDiscord extends ObservableDiscord {
  override async exchange(code = 'alice') {
    return { access_token: code, refresh_token: code, expires_in: 3600 };
  }
  override async refresh(token = 'alice') {
    return this.exchange(token);
  }
  override async identity(token = 'alice') {
    return { id: token, username: token, avatar: null };
  }
  override async guilds(token = 'alice') {
    this.guildCalls++;
    return [this.availableGuilds[token === 'alice' ? 0 : 1]];
  }
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(discord = new ObservableDiscord()) {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = Date.now();
  const server = await createServer(
    db.repo,
    undefined,
    {
      ...fakeAuthOptions(discord, () => now),
      serviceToken: 'event-service',
      channelAdapter: {
        list: async guildId => [
          { id: 'channel', guildId, name: 'general', type: 0, accessible: true },
        ],
      },
      botInstallationAdapter: {
        observeBotMembership: async () => 'installed',
        getApplicationId: async () => null,
      },
    },
    { model: 'fixture', embed: async () => [1, 0] },
  );
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const streamId = randomUUID();
  const event = (body: Record<string, unknown>, authorization = 'Bearer event-service') =>
    fetch(`${base}/api/v1/internal/guild-access/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ streamId, ...body }),
    });
  return {
    db,
    discord,
    base,
    event,
    server,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test('member removal immediately denies existing sessions without changing another guild', async () => {
  const { base, event } = await fixture();
  const first = await loginAsTestUser(base);
  const second = await loginAsTestUser(base);
  expect(
    (
      await event({
        kind: 'reset',
        sequence: 0,
        guildIds: ['guild-1', 'guild-2'],
        membersIntent: true,
        connected: true,
      })
    ).status,
  ).toBe(200);
  expect(
    (await event({ kind: 'member_remove', sequence: 1, guildId: 'guild-1', userId: 'user-1' }))
      .status,
  ).toBe(200);
  for (const token of [first.token, second.token]) {
    const headers = { Authorization: `Bearer ${token}` };
    for (const path of [
      '/decisions',
      '/search?query=why',
      '/discord/channels',
      '/discord/bot-status',
    ]) {
      const separator = path.includes('?') ? '&' : '?';
      const denied = await fetch(`${base}/api/v1${path}${separator}guildId=guild-1`, { headers });
      expect(denied.status, path).toBe(403);
    }
    const allowed = await fetch(`${base}/api/v1/decisions?guildId=guild-2`, { headers });
    expect(allowed.status).toBe(200);
  }
});

test('live Gateway permissions survive elapsed time while JWT renewal never queries Discord', async () => {
  const { base, event, discord, advance } = await fixture();
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: true,
    connected: true,
  });
  const start = await fetch(`${base}/api/v1/auth/authorize`);
  const state = new URL((await start.json()).data.url).searchParams.get('state');
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Cookie: start.headers.get('set-cookie')!.split(';')[0],
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code: 'valid-code', state }),
  });
  const cookie = login.headers
    .getSetCookie()
    .find(value => value.startsWith('ggaddak_session='))!
    .split(';')[0];
  const original = (await login.json()).data.accessToken;
  const calls = discord.guildCalls;
  advance(30 * 60 * 1000);
  await event({ kind: 'heartbeat', sequence: 0, connected: true });
  discord.unavailable = true;
  const renew = await fetch(`${base}/api/v1/auth/token`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: new URL(testAuthConfig.redirectUri).origin },
  });
  expect(renew.status).toBe(200);
  const token = (await renew.json()).data.accessToken;
  expect(
    (await fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${original}` } }))
      .status,
  ).toBe(401);
  expect(
    (
      await fetch(`${base}/api/v1/decisions?guildId=guild-1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  expect(discord.guildCalls).toBe(calls);
  const deniedOrigin = await fetch(`${base}/api/v1/auth/token`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://attacker.example' },
  });
  expect(deniedOrigin.status).toBe(403);
});

test('intent absence and connection lease loss revalidate on demand, sharing concurrent verification', async () => {
  const { base, event, discord, advance } = await fixture();
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: false,
    connected: true,
  });
  const { token } = await loginAsTestUser(base);
  const headers = { Authorization: `Bearer ${token}` };
  const calls = discord.guildCalls;
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  discord.pending = {
    started,
    released: new Promise<void>(resolve => {
      release = resolve;
    }),
  };
  const first = fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers });
  await began;
  const second = fetch(`${base}/api/v1/decisions?guildId=guild-2`, { headers });
  // Let both HTTP requests reach the provider boundary before completing verification.
  await new Promise(resolve => setTimeout(resolve, 20));
  release();
  expect((await Promise.all([first, second])).map(response => response.status)).toEqual([200, 200]);
  expect(discord.guildCalls).toBe(calls + 1);
  advance(GuildAccessPolicy.leaseMs + 1);
  discord.availableGuilds = [discord.availableGuilds[1]];
  expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(403);
});

test('late OAuth results cannot resurrect a removed membership, while verified rejoining can', async () => {
  const { base, event, discord } = await fixture();
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: true,
    connected: true,
  });
  const { token } = await loginAsTestUser(base);
  const headers = { Authorization: `Bearer ${token}` };
  await event({ kind: 'guild_change', sequence: 1, guildId: 'guild-1' });
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  discord.pending = {
    started,
    released: new Promise<void>(resolve => {
      release = resolve;
    }),
  };
  const pending = fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers });
  await began;
  await event({ kind: 'member_remove', sequence: 2, guildId: 'guild-1', userId: 'user-1' });
  release();
  expect((await pending).status).toBe(503);
  expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(403);
  await event({ kind: 'member_join', sequence: 3, guildId: 'guild-1', userId: 'user-1' });
  expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(200);
});

test('role changes revoke management and Bot removal changes installation without hiding decisions', async () => {
  const { base, event, discord, db } = await fixture();
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: true,
    connected: true,
  });
  const { token } = await loginAsTestUser(base);
  const headers = { Authorization: `Bearer ${token}` };
  const managed = () =>
    fetch(`${base}/api/v1/discord/channels?guildId=guild-1`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelIds: [] }),
    });
  expect((await managed()).status).toBe(200);
  discord.availableGuilds[0] = { ...discord.availableGuilds[0], owner: false, permissions: '0' };
  await event({ kind: 'member_change', sequence: 1, guildId: 'guild-1', userId: 'user-1' });
  expect((await managed()).status).toBe(403);
  const status = async () =>
    (await (await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, { headers })).json())
      .data.status;
  await event({ kind: 'guild_unavailable', sequence: 2, guildId: 'guild-1' });
  expect(await status()).toBe('unknown');
  await event({ kind: 'guild_available', sequence: 3, guildId: 'guild-1' });
  expect(await status()).toBe('installed');
  await db.repo.saveDecision(
    DecisionSchema.parse({
      id: 'private-1',
      topic: 'Choice',
      decision: 'Use SQLite',
      rationale: 'Existing storage',
      state: 'Decided',
      actionItems: [],
      supersedesId: null,
      source: {
        guildId: 'guild-1',
        channelId: 'channel',
        triggerMessageId: '100',
        participants: [],
      },
      createdAt: new Date().toISOString(),
    }),
  );
  await event({ kind: 'guild_remove', sequence: 4, guildId: 'guild-1' });
  expect(await status()).toBe('not_installed');
  const decisions = await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers });
  expect(decisions.status).toBe(200);
  expect(JSON.stringify(await decisions.json())).toContain('Use SQLite');
});

test('event authentication, idempotence and sequence gaps cannot bypass guild authorization', async () => {
  const { base, event, discord } = await fixture();
  const { token } = await loginAsTestUser(base);
  for (const credential of ['', 'Bearer invalid', `Bearer ${token}`])
    expect(
      (
        await event(
          { kind: 'reset', sequence: 0, guildIds: [], membersIntent: true, connected: true },
          credential,
        )
      ).status,
    ).toBe(401);
  expect(
    (await event({ kind: 'member_remove', sequence: 1, guildId: 'guild-1', userId: 'user-1' }))
      .status,
  ).toBe(409);
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: true,
    connected: true,
  });
  await event({ kind: 'member_remove', sequence: 1, guildId: 'guild-1', userId: 'user-1' });
  expect(
    (await event({ kind: 'member_remove', sequence: 1, guildId: 'guild-1', userId: 'user-1' }))
      .status,
  ).toBe(200);
  expect((await event({ kind: 'guild_change', sequence: 3, guildId: 'guild-2' })).status).toBe(409);
  expect((await event({ kind: 'heartbeat', sequence: 1, connected: true })).status).toBe(409);
  discord.unavailable = true;
  expect(
    (
      await fetch(`${base}/api/v1/decisions?guildId=guild-2`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(502);
});

test('two users see only their own server lists and cannot substitute guild or Decision IDs', async () => {
  const { base, db, event } = await fixture(new TwoUsersDiscord());
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    membersIntent: true,
    connected: true,
  });
  const alice = await loginAsTestUser(base, 'alice');
  const bob = await loginAsTestUser(base, 'bob');
  await db.repo.saveDecision(
    DecisionSchema.parse({
      id: 'alice-decision',
      topic: 'Private',
      decision: 'Alice uses SQLite',
      rationale: 'Existing storage',
      state: 'Decided',
      actionItems: [],
      supersedesId: null,
      source: {
        guildId: 'guild-1',
        channelId: 'channel',
        triggerMessageId: '100',
        participants: [],
      },
      createdAt: new Date().toISOString(),
    }),
  );
  for (const [token, own, other] of [
    [alice.token, 'guild-1', 'guild-2'],
    [bob.token, 'guild-2', 'guild-1'],
  ]) {
    const headers = { Authorization: `Bearer ${token}` };
    const guilds = await fetch(`${base}/api/v1/auth/guilds`, { headers });
    expect((await guilds.json()).data.guilds.map((g: { id: string }) => g.id)).toEqual([own]);
    for (const path of [
      '/decisions',
      '/search?query=SQLite',
      '/discord/channels',
      '/discord/bot-status',
    ]) {
      const separator = path.includes('?') ? '&' : '?';
      expect(
        (await fetch(`${base}/api/v1${path}${separator}guildId=${own}`, { headers })).status,
        path,
      ).toBe(200);
      expect(
        (await fetch(`${base}/api/v1${path}${separator}guildId=${other}`, { headers })).status,
        path,
      ).toBe(403);
    }
  }
  expect(
    (
      await fetch(`${base}/api/v1/decisions/alice-decision?guildId=guild-2`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${base}/api/v1/decisions/alice-decision?guildId=guild-2`, {
        headers: { Authorization: `Bearer ${alice.token}` },
      })
    ).status,
  ).toBe(403);
  await event({ kind: 'member_remove', sequence: 1, guildId: 'guild-1', userId: 'alice' });
  expect(
    (
      await fetch(`${base}/api/v1/decisions?guildId=guild-2`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      })
    ).status,
  ).toBe(200);
  const remaining = await fetch(`${base}/api/v1/auth/guilds`, {
    headers: { Authorization: `Bearer ${alice.token}` },
  });
  expect((await remaining.json()).data.guilds).toEqual([]);
});

test('receiver restart requires new coverage and a temporary unavailable snapshot is never Bot removal', async () => {
  const { base, db, event, discord, server } = await fixture();
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2'],
    unavailableGuildIds: ['guild-1'],
    membersIntent: true,
    connected: true,
  });
  const { token } = await loginAsTestUser(base);
  const headers = { Authorization: `Bearer ${token}` };
  const status = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, { headers });
  expect((await status.json()).data.status).toBe('unknown');
  await event({ kind: 'guild_available', sequence: 1, guildId: 'guild-1' });
  expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(200);
  await new Promise<void>(resolve => server.close(() => resolve()));
  const restarted = await createServer(db.repo, undefined, {
    ...fakeAuthOptions(discord),
    serviceToken: 'event-service',
  });
  await new Promise<void>(resolve => restarted.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => restarted.close(() => resolve())));
  const address = restarted.address() as import('node:net').AddressInfo;
  const next = `http://127.0.0.1:${address.port}/api/v1`;
  discord.unavailable = true;
  expect((await fetch(`${next}/auth/me`, { headers })).status).toBe(200);
  const denied = await fetch(`${next}/decisions?guildId=guild-1`, { headers });
  expect(denied.status).toBe(502);
  expect((await denied.json()).code).toBe('GUILD_ACCESS_UNAVAILABLE');
  discord.unavailable = false;
  expect((await fetch(`${next}/decisions?guildId=guild-1`, { headers })).status).toBe(200);
});
