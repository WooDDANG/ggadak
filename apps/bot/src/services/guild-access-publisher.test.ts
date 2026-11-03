import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GuildAccessPublisher } from './guild-access-publisher.js';

test('membership invalidations are authenticated, retained on failure, and drained before a live heartbeat', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-'));
  const sent: Array<{ kind: string; sequence: number; guildId?: string; userId?: string }> = [];
  let offline = false;
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (url, init) => {
      assert.equal(String(url), 'http://backend/api/v1/internal/guild-access/events');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-service');
      assert.ok(init?.signal);
      const event = JSON.parse(init!.body as string);
      sent.push(event);
      return new Response('', { status: offline ? 503 : 200 });
    },
  });
  try {
    await publisher.ready({ guildIds: ['guild-1'], membersIntent: true });
    assert.equal(sent[0].kind, 'reset');
    offline = true;
    await assert.rejects(
      publisher.publish({ kind: 'member_remove', guildId: 'guild-1', userId: 'departed' }),
      /503/,
    );
    assert.equal(sent.at(-1)?.kind, 'member_remove');
    offline = false;
    sent.length = 0;
    await publisher.flush();
    assert.deepEqual(
      sent.map(event => event.kind),
      ['member_remove', 'heartbeat'],
    );
    assert.equal(sent[0].sequence, 1);
    assert.equal(sent[1].sequence, 1);
    assert.equal(sent[0].userId, 'departed');
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a restarted producer invalidates old proofs before compacting retained events or renewing trust', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-restart-'));
  const events: Array<{ kind: string; streamId: string; sequence: number }> = [];
  let status = 200;
  const options = {
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: (async (_url, init) => {
      events.push(JSON.parse(init!.body as string));
      return new Response('', { status });
    }) as typeof fetch,
  };
  const first = new GuildAccessPublisher(options);
  let restarted: GuildAccessPublisher | undefined;
  try {
    await first.ready({ guildIds: ['guild-1'], membersIntent: true });
    const previousStream = events[0].streamId;
    status = 503;
    await assert.rejects(
      first.publish({ kind: 'member_remove', guildId: 'guild-1', userId: 'departed' }),
      /503/,
    );
    first.close();
    restarted = new GuildAccessPublisher(options);
    events.length = 0;
    await assert.rejects(restarted.ready({ guildIds: ['guild-1'], membersIntent: true }), /503/);
    assert.deepEqual(
      events.map(event => event.kind),
      ['reset'],
    );
    status = 200;
    events.length = 0;
    await restarted.flush();
    assert.deepEqual(
      events.map(event => event.kind),
      ['reset', 'heartbeat'],
    );
    assert.notEqual(events[0].streamId, previousStream);
    assert.equal(events[0].sequence, 0);
    assert.equal(events[1].sequence, 0);
  } finally {
    first.close();
    restarted?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a rejected sequence rotates the producer and restores trust only after a fresh reset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-gap-'));
  const events: Array<{ kind: string; streamId: string; sequence: number }> = [];
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      const event = JSON.parse(init!.body as string);
      events.push(event);
      return new Response('', { status: event.kind === 'member_remove' ? 409 : 200 });
    },
  });
  try {
    await publisher.ready({ guildIds: ['guild-1'], membersIntent: true });
    const previousStream = events[0].streamId;
    await assert.rejects(
      publisher.publish({ kind: 'member_remove', guildId: 'guild-1', userId: 'departed' }),
      /409/,
    );
    events.length = 0;
    await publisher.flush();
    assert.deepEqual(
      events.map(event => event.kind),
      ['reset', 'heartbeat'],
    );
    assert.notEqual(events[0].streamId, previousStream);
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stopped Gateway cannot keep cached permissions trusted through HTTP heartbeats', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-stopped-'));
  const events: Array<{ kind: string }> = [];
  let gatewayReady = true;
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    isGatewayReady: () => gatewayReady,
    transport: async (_url, init) => {
      events.push(JSON.parse(init!.body as string));
      return new Response('', { status: 200 });
    },
  });
  try {
    await publisher.ready({ guildIds: ['guild-1'], membersIntent: true });
    gatewayReady = false;
    events.length = 0;
    await publisher.flush();
    assert.deepEqual(events, []);
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a lost reset acknowledgement cannot swallow a later invalidation while retrying the same reset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guild-access-reset-ack-'));
  const events: Array<{ kind: string; guildIds?: string[]; sequence: number }> = [];
  let loseAcknowledgement = true;
  const publisher = new GuildAccessPublisher({
    backendUrl: 'http://backend',
    directory,
    token: 'fixture-service',
    transport: async (_url, init) => {
      const event = JSON.parse(init!.body as string);
      events.push(event);
      if (event.kind === 'reset' && loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error('reset acknowledgement lost');
      }
      return new Response('', { status: 200 });
    },
  });
  try {
    await assert.rejects(
      publisher.ready({ guildIds: ['guild-1'], membersIntent: true }),
      /acknowledgement lost/,
    );
    await publisher.publish({ kind: 'guild_remove', guildId: 'guild-1' });
    assert.deepEqual(
      events.map(event => event.kind),
      ['reset', 'reset', 'guild_remove', 'heartbeat'],
    );
    assert.deepEqual(events[0].guildIds, events[1].guildIds);
    assert.equal(events[2].sequence, 1);
    assert.equal(events[3].sequence, 1);
  } finally {
    publisher.close();
    await rm(directory, { recursive: true, force: true });
  }
});
