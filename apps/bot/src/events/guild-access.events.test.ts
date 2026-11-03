import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection, Events } from 'discord.js';
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
    const guild = { id: 'guild-1' };
    const member = { id: 'user-1', guild };
    client.emit(Events.GuildMemberRemove, member);
    client.emit(Events.GuildMemberAdd, member);
    client.emit(
      Events.GuildMemberUpdate,
      {
        ...member,
        partial: false,
        roles: { cache: new Collection([['manager', { id: 'manager' }]]) },
      },
      { ...member, roles: { cache: new Collection() } },
    );
    client.emit(
      Events.GuildRoleUpdate,
      { permissions: { bitfield: 32n } },
      { guild, permissions: { bitfield: 0n } },
    );
    client.emit(Events.GuildRoleDelete, { guild });
    client.emit(
      Events.GuildUpdate,
      { ownerId: 'old-owner' },
      { id: 'guild-1', ownerId: 'new-owner' },
    );
    client.emit(Events.GuildUnavailable, guild);
    client.emit(Events.GuildDelete, guild);
    client.emit(Events.GuildCreate, guild);
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
    client.emit(Events.GuildMemberRemove, { id: 'user-1', guild: { id: 'guild-1' } });
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
    client.emit(Events.GuildMemberRemove, { id: 'user-1', guild: { id: 'guild-1' } });
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
