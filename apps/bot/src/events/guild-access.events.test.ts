import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client as DiscordClient, Collection, Events, GatewayIntentBits, Status } from 'discord.js';
import type { Client } from 'discordx';
import { GuildAccessPublisher } from '../services/guild-access-publisher.js';
import { registerGuildAccessEvents } from './guild-access.events.js';
import { guildMembersIntentEnabled } from '../config.js';

function gateway() {
  const client = new EventEmitter() as EventEmitter & {
    guilds: { cache: Collection<string, { id: string; available: boolean }> };
  };
  client.guilds = { cache: new Collection([['guild-1', { id: 'guild-1', available: true }]]) };
  return client;
}

function raw(client: EventEmitter, type: string, data: unknown) {
  client.emit(Events.Raw, { op: 0, t: type, s: 1, d: data }, 0);
}

const sdkGuild = {
  id: '100000000000000001',
  name: 'Fixture',
  owner_id: '100000000000000002',
  unavailable: false,
  channels: [],
  members: [],
  presences: [],
  voice_states: [],
  emojis: [],
  stickers: [],
  features: [],
  member_count: 1,
  roles: [
    {
      id: '100000000000000001',
      name: '@everyone',
      permissions: '0',
      position: 0,
      color: 0,
      hoist: false,
      managed: false,
      mentionable: false,
    },
  ],
};

/** Feed the installed SDK at its WebSocket transport boundary, including its real packet handlers. */
function sdkGateway() {
  const client = new DiscordClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [],
  });
  const wire = Object.assign(new EventEmitter(), { destroy: async () => {} });
  const shard = Object.assign(new EventEmitter(), {
    id: 0,
    status: Status.Ready,
    sessionInfo: { sequence: 10 },
    closeSequence: 0,
    checkReady: () => {},
  });
  const manager = client.ws as unknown as {
    _ws: typeof wire;
    status: Status;
    shards: Collection<number, typeof shard>;
    attachEvents(): void;
  };
  manager._ws = wire;
  manager.status = Status.Ready;
  manager.shards.set(0, shard);
  manager.attachEvents();
  let sequence = 0;
  const dispatch = (type: string, data: unknown) =>
    wire.emit('dispatch', {
      data: { op: 0, t: type, s: ++sequence, d: data },
      shardId: 0,
    });
  dispatch('READY', {
    v: 10,
    user: {
      id: '100000000000000099',
      username: 'FixtureBot',
      discriminator: '0',
      avatar: null,
      bot: true,
    },
    guilds: [],
    application: { id: '100000000000000099', flags: 0 },
    session_id: 'fixture',
    resume_gateway_url: 'wss://fixture.invalid',
  });
  dispatch('GUILD_CREATE', sdkGuild);
  return {
    client,
    shard,
    dispatch,
    resume: () => {
      wire.emit('resumed', { shardId: 0 });
      dispatch('RESUMED', {});
    },
  };
}

test('an uncached member removal reaches BE even when the real SDK omits its high-level event', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-sdk-uncached-'));
  const sent: Array<{ kind: string; guildId?: string; userId?: string }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const { client, dispatch } = sdkGateway();
  registerGuildAccessEvents(client as unknown as Client, publisher, true);
  let highLevelRemovals = 0;
  client.on(Events.GuildMemberRemove, () => {
    highLevelRemovals++;
  });
  try {
    client.emit(Events.ClientReady, client as DiscordClient<true>);
    await publisher.flush();
    sent.length = 0;
    dispatch('GUILD_MEMBER_REMOVE', { guild_id: sdkGuild.id, user: { id: '100000000000000003' } });
    await publisher.flush();
    assert.equal(
      highLevelRemovals,
      0,
      'SDK without GuildMember partials suppresses uncached removals',
    );
    assert.deepEqual(
      sent
        .filter(event => event.kind !== 'heartbeat')
        .map(({ kind, guildId, userId }) => ({ kind, guildId, userId })),
      [{ kind: 'member_remove', guildId: sdkGuild.id, userId: '100000000000000003' }],
    );
  } finally {
    publisher.close();
    await client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('real SDK resume replay invalidations are delivered before trust resumes despite suppressed member events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-sdk-replay-'));
  const sent: Array<{ kind: string }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const { client, shard, dispatch, resume } = sdkGateway();
  const member = {
    guild_id: sdkGuild.id,
    user: { id: '100000000000000003', username: 'Departed', discriminator: '0', avatar: null },
    roles: [],
    joined_at: '2026-01-01T00:00:00.000Z',
    deaf: false,
    mute: false,
    flags: 0,
  };
  dispatch('GUILD_MEMBER_ADD', member);
  registerGuildAccessEvents(client as unknown as Client, publisher, true);
  let highLevelMembers = 0;
  client.on(Events.GuildMemberRemove, () => {
    highLevelMembers++;
  });
  client.on(Events.GuildMemberUpdate, () => {
    highLevelMembers++;
  });
  client.on(Events.GuildMemberAdd, () => {
    highLevelMembers++;
  });
  try {
    client.emit(Events.ClientReady, client as DiscordClient<true>);
    await publisher.flush();
    sent.length = 0;
    client.emit(Events.ShardReconnecting, 0);
    shard.status = Status.Resuming;
    dispatch('GUILD_MEMBER_UPDATE', { ...member, roles: ['100000000000000004'] });
    dispatch('GUILD_MEMBER_REMOVE', { guild_id: sdkGuild.id, user: member.user });
    dispatch('GUILD_MEMBER_ADD', { ...member, user: { ...member.user, id: '100000000000000005' } });
    resume();
    await publisher.flush();
    assert.equal(
      highLevelMembers,
      0,
      'the installed SDK suppresses high-level member events during replay',
    );
    assert.deepEqual(
      sent.filter(event => event.kind !== 'heartbeat').map(event => event.kind),
      ['disconnect', 'member_change', 'member_remove', 'member_join'],
    );
    assert.equal(sent.at(-1)?.kind, 'heartbeat');
  } finally {
    publisher.close();
    await client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the real SDK recovery of a cached unavailable guild restores its installation observation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-sdk-available-'));
  const sent: Array<{ kind: string }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const { client, dispatch } = sdkGateway();
  registerGuildAccessEvents(client as unknown as Client, publisher, true);
  let available = 0;
  let joined = 0;
  client.on(Events.GuildAvailable, () => {
    available++;
  });
  client.on(Events.GuildCreate, () => {
    joined++;
  });
  try {
    client.emit(Events.ClientReady, client as DiscordClient<true>);
    await publisher.flush();
    sent.length = 0;
    dispatch('GUILD_DELETE', { id: sdkGuild.id, unavailable: true });
    dispatch('GUILD_CREATE', sdkGuild);
    await publisher.flush();
    assert.equal(available, 1);
    assert.equal(joined, 0);
    assert.deepEqual(
      sent.filter(event => event.kind !== 'heartbeat').map(event => event.kind),
      ['guild_unavailable', 'guild_available'],
    );
  } finally {
    publisher.close();
    await client.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Discord membership, role and installation changes preserve their distinct meanings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-events-'));
  const sent: Array<{
    kind: string;
    guildId?: string;
    userId?: string;
    guildIds?: string[];
    unavailableGuildIds?: string[];
  }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const client = gateway();
  client.guilds.cache.set('temporarily-unavailable', {
    id: 'temporarily-unavailable',
    available: false,
  });
  registerGuildAccessEvents(client as unknown as Client, publisher, true);
  try {
    client.emit(Events.ClientReady);
    await publisher.flush();
    assert.deepEqual(sent[0].guildIds, ['guild-1', 'temporarily-unavailable']);
    assert.deepEqual(sent[0].unavailableGuildIds, ['temporarily-unavailable']);
    sent.length = 0;
    const member = { guild_id: 'guild-1', user: { id: 'user-1' } };
    raw(client, 'GUILD_MEMBER_REMOVE', member);
    raw(client, 'GUILD_MEMBER_ADD', member);
    raw(client, 'GUILD_MEMBER_UPDATE', { ...member, roles: [] });
    raw(client, 'GUILD_ROLE_UPDATE', {
      guild_id: 'guild-1',
      role: { id: 'role-1', permissions: '0' },
    });
    raw(client, 'GUILD_ROLE_DELETE', { guild_id: 'guild-1', role_id: 'role-1' });
    raw(client, 'GUILD_UPDATE', { id: 'guild-1', owner_id: 'new-owner' });
    raw(client, 'GUILD_DELETE', { id: 'guild-1', unavailable: true });
    raw(client, 'GUILD_DELETE', { id: 'guild-1' });
    raw(client, 'GUILD_CREATE', { id: 'guild-1' });
    await publisher.flush();
    assert.deepEqual(
      sent.filter(event => event.kind !== 'heartbeat').map(event => event.kind),
      [
        'member_remove',
        'member_join',
        'member_change',
        'guild_change',
        'guild_change',
        'guild_change',
        'guild_unavailable',
        'guild_remove',
        'guild_available',
      ],
    );
    assert.equal(sent.find(event => event.kind === 'member_remove')?.userId, 'user-1');
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('membership coverage is opt-in and cannot be claimed by an unconfigured producer', async () => {
  assert.equal(guildMembersIntentEnabled({}), false);
  assert.equal(guildMembersIntentEnabled({ DISCORD_GUILD_MEMBERS_INTENT: 'true' }), true);
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-intent-'));
  const sent: Array<{ kind: string; membersIntent?: boolean }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const client = gateway();
  registerGuildAccessEvents(client as unknown as Client, publisher, false);
  try {
    client.emit(Events.ClientReady);
    await publisher.flush();
    assert.equal(sent[0].membersIntent, false);
    sent.length = 0;
    raw(client, 'GUILD_MEMBER_REMOVE', { guild_id: 'guild-1', user: { id: 'user-1' } });
    await publisher.flush();
    assert.equal(
      sent.some(event => event.kind === 'member_remove'),
      false,
    );
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('replay on every disconnected shard completes before a live lease is renewed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-resume-'));
  const sent: Array<{ kind: string }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  const client = gateway();
  registerGuildAccessEvents(client as unknown as Client, publisher, true);
  try {
    client.emit(Events.ClientReady);
    await publisher.flush();
    sent.length = 0;
    client.emit(Events.ShardReconnecting, 0);
    client.emit(Events.ShardReconnecting, 1);
    raw(client, 'GUILD_MEMBER_REMOVE', { guild_id: 'guild-1', user: { id: 'user-1' } });
    client.emit(Events.ShardResume, 0, 1);
    await publisher.flush();
    assert.equal(
      sent.some(event => event.kind === 'heartbeat'),
      false,
    );
    sent.length = 0;
    client.emit(Events.ShardResume, 1, 0);
    await publisher.flush();
    assert.ok(sent.length > 0);
    assert.ok(sent.every(event => event.kind === 'heartbeat'));
    sent.length = 0;
    client.emit(Events.ShardReconnecting, 0);
    client.emit(Events.ShardReady, 0, undefined);
    await publisher.flush();
    assert.ok(sent.some(event => event.kind === 'reset'));
    assert.equal(sent.at(-1)?.kind, 'heartbeat');
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});
