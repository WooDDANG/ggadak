import { afterEach, test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import {
  fakeAuthOptions,
  testAuthConfig,
  FakeDiscordAuth,
  loginAsTestUser,
} from '../src/test-support/auth.js';
import type { DiscordGuildInventoryAdapter } from '../src/adapters/discord-bot-installation.adapter.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(inventory: DiscordGuildInventoryAdapter) {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const discord = new FakeDiscordAuth();
  // No channel or card data is needed to make a normal member's server eligible.
  discord.availableGuilds = discord.availableGuilds.map(guild => ({
    ...guild,
    owner: false,
    permissions: '0',
  }));
  const server = await createServer(db.repo, undefined, {
    ...fakeAuthOptions(discord),
    serviceToken: 'event-test',
    guildInventoryAdapter: inventory,
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const streamId = randomUUID();
  const event = async (body: Record<string, unknown>) => {
    const response = await fetch(`${base}/api/v1/internal/guild-access/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer event-test' },
      body: JSON.stringify({ streamId, ...body }),
    });
    expect(response.status).toBe(200);
  };
  const list = async (token: string) => {
    const response = await fetch(`${base}/api/v1/auth/guilds`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  return { base, event, list, discord };
}

test('login, browser restore and guild list return only joined servers with the GGADDAK bot', async () => {
  const db = await isolatedRepository();
  const adapter = {
    listInstalledGuilds: async () => ['guild-1', 'foreign-installed'],
    observeBotMembership: async (guildId: string) =>
      guildId === 'guild-1' ? ('installed' as const) : ('not_installed' as const),
    getApplicationId: async () => null,
  };
  const server = await createServer(db.repo, undefined, {
    ...fakeAuthOptions(),
    guildInventoryAdapter: adapter,
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/v1/auth`;
  try {
    const start = await fetch(`${base}/authorize`);
    const state = new URL((await start.json()).data.url).searchParams.get('state');
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: start.headers.get('set-cookie')!.split(';')[0],
      },
      body: JSON.stringify({ code: 'fixture', state }),
    });
    expect(login.status).toBe(200);
    const data = (await login.json()).data;
    expect(data.guilds.map((g: { id: string }) => g.id)).toEqual(['guild-1']);
    expect(data.guildSelection.status).toBe('ready');
    const list = await fetch(`${base}/guilds`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    expect((await list.json()).data.guilds.map((g: { id: string }) => g.id)).toEqual(['guild-1']);
    const cookie = login.headers
      .getSetCookie()
      .find(s => s.startsWith('ggaddak_session='))!
      .split(';')[0];
    const restored = await fetch(`${base}/session`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: new URL(testAuthConfig.redirectUri).origin },
    });
    expect(restored.status).toBe(200);
    expect((await restored.json()).data.guilds.map((g: { id: string }) => g.id)).toEqual([
      'guild-1',
    ]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('an unavailable inventory preserves login and differs from a verified empty list, with on-demand recovery', async () => {
  let installed: string[] | null = null;
  const { base, list } = await fixture({ listInstalledGuilds: async () => installed });
  const { token } = await loginAsTestUser(base);
  expect(await list(token)).toMatchObject({
    guilds: [],
    guildSelection: { status: 'unavailable', checkedAt: null },
  });
  expect(
    (await fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
  ).toBe(200);
  installed = [];
  expect(await list(token)).toMatchObject({ guilds: [], guildSelection: { status: 'ready' } });
  installed = ['guild-2'];
  const recovered = await list(token);
  expect(recovered.guilds.map((g: { id: string }) => g.id)).toEqual(['guild-2']);
  expect(recovered.guilds[0]).toMatchObject({ owner: false, permissions: '0' });
  expect(recovered.guildSelection.status).toBe('ready');
});

test('live inventory handles removal, reinstall and member leave without per-server inventory checks', async () => {
  let inventoryCalls = 0;
  const { base, list, event } = await fixture({
    listInstalledGuilds: async () => {
      inventoryCalls++;
      return null;
    },
  });
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1', 'guild-2', 'foreign-installed'],
    connected: true,
    membersIntent: true,
  });
  const { token } = await loginAsTestUser(base);
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual([
    'guild-1',
    'guild-2',
  ]);
  await event({ kind: 'guild_remove', sequence: 1, guildId: 'guild-1' });
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual(['guild-2']);
  // Selection policy changes do not remove existing record access for a joined user.
  expect(
    (
      await fetch(`${base}/api/v1/decisions?guildId=guild-1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
  ).toBe(200);
  await event({ kind: 'guild_available', sequence: 2, guildId: 'guild-1' });
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual([
    'guild-1',
    'guild-2',
  ]);
  await event({ kind: 'member_remove', sequence: 3, guildId: 'guild-1', userId: 'user-1' });
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual(['guild-2']);
  expect(inventoryCalls).toBe(0);
});

test('offline Gateway and unknown observations fall back to authorized inventory rather than assuming uninstall', async () => {
  const { base, list, event } = await fixture({ listInstalledGuilds: async () => ['guild-1'] });
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1'],
    unavailableGuildIds: ['guild-1'],
    connected: true,
    membersIntent: true,
  });
  const { token } = await loginAsTestUser(base);
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual(['guild-1']);
  await event({ kind: 'disconnect', sequence: 1 });
  expect((await list(token)).guilds.map((g: { id: string }) => g.id)).toEqual(['guild-1']);
});

test('concurrent inventory recovery is shared and late results cannot overwrite a newer removal event', async () => {
  let release!: (ids: string[]) => void;
  let started!: () => void;
  let calls = 0;
  let hold = false;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  const waiting = new Promise<string[]>(resolve => {
    release = resolve;
  });
  const { base, list, event } = await fixture({
    listInstalledGuilds: async () => {
      calls++;
      if (!hold) return ['guild-1'];
      started();
      return waiting;
    },
  });
  const { token } = await loginAsTestUser(base);
  hold = true;
  const before = calls;
  const first = list(token);
  await began;
  const second = list(token);
  // Let the second HTTP request reach the held external provider boundary.
  await new Promise(resolve => setTimeout(resolve, 50));
  await event({ kind: 'reset', sequence: 0, guildIds: [], connected: true, membersIntent: true });
  release(['guild-1']);
  for (const result of await Promise.all([first, second]))
    expect(result).toMatchObject({ guilds: [], guildSelection: { status: 'unavailable' } });
  expect(calls).toBe(before + 1);
  expect(await list(token)).toMatchObject({ guilds: [], guildSelection: { status: 'ready' } });
});

test('a request after invalidation does not reuse an older in-flight inventory', async () => {
  let calls = 0;
  let release!: (ids: string[]) => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => {
    started = resolve;
  });
  const held = new Promise<string[]>(resolve => {
    release = resolve;
  });
  const { base, list, event } = await fixture({
    listInstalledGuilds: async () => {
      calls++;
      if (calls === 1) return ['guild-1'];
      if (calls === 2) {
        started();
        return held;
      }
      return [];
    },
  });
  const { token } = await loginAsTestUser(base);
  const old = list(token);
  await began;
  await event({
    kind: 'reset',
    sequence: 0,
    guildIds: ['guild-1'],
    unavailableGuildIds: ['guild-1'],
    connected: true,
    membersIntent: true,
  });
  try {
    expect(await list(token)).toMatchObject({ guilds: [], guildSelection: { status: 'ready' } });
  } finally {
    release(['guild-1']);
  }
  expect(await old).toMatchObject({ guilds: [], guildSelection: { status: 'unavailable' } });
});
