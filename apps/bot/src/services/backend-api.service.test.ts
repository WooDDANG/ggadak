import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendApiService } from './backend-api.service.js';

test('failed delivery survives restart and retry retains its Analysis Request and original payload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'analysis-delivery-'));
  const sent: any[] = [];
  try {
    const offline = new BackendApiService('http://fixture', directory, async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return new Response('offline', { status: 503 });
    });
    const payload = {
      rawMessages: [{ id: '100', content: 'SQLite를 채택합시다' }],
      channelId: 'channel',
      triggerMessageId: '100',
    };
    await assert.rejects(offline.analyzeDiscussion(payload), /503/);
    assert.equal((await readdir(directory)).length, 1);
    const restarted = new BackendApiService('http://fixture', directory, async (_url, init) => {
      sent.push(JSON.parse(init!.body as string));
      return Response.json({ found: true, decisions: [{ id: 'candidate' }] });
    });
    const retried = await restarted.retryPendingAnalyses();
    assert.equal(retried[0].result.decisions[0].id, 'candidate');
    assert.deepEqual(sent[1], sent[0]);
    assert.ok(sent[0].requestId);
    assert.equal((await readdir(directory)).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('checkpoint writes reject failures instead of acknowledging progress', async () => {
  const api = new BackendApiService(
    'http://fixture',
    '/unused',
    async () => new Response('offline', { status: 503 }),
  );
  await assert.rejects(api.saveCheckpoint('channel', '100'), /503/);
});

test('reusing a pending request ID with changed evidence is rejected without replacing the original delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'analysis-conflict-'));
  let calls = 0;
  const api = new BackendApiService('http://fixture', directory, async () => {
    calls++;
    return new Response('', { status: 503 });
  });
  try {
    await assert.rejects(
      api.analyzeDiscussion({ requestId: 'same', rawMessages: [{ id: '100', content: 'first' }] }),
    );
    await assert.rejects(
      api.analyzeDiscussion({
        requestId: 'same',
        rawMessages: [{ id: '100', content: 'changed' }],
      }),
      /different payload/,
    );
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('event analysis failure removes processing reaction, marks failure and keeps delivery pending', async () => {
  const { DiscussionHarvester } = await import('./harvester.service.js');
  const { DEFAULT_HARVESTING_POLICY } = await import('@ggaddak/shared');
  const directory = await mkdtemp(join(tmpdir(), 'analysis-reaction-'));
  const reactions: string[] = [];
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async () => new Response('', { status: 503 }),
  );
  const message: any = {
    id: '100',
    channelId: 'channel',
    guildId: 'guild',
    content: 'SQLite를 채택합시다',
    createdAt: new Date('2026-01-01'),
    author: { id: 'user', username: 'Lee' },
    channel: {
      id: 'channel',
      name: 'general',
      isTextBased: () => true,
      isThread: () => false,
      messages: { fetch: async () => new Map() },
    },
    reactions: {
      cache: {
        values: () => [],
        find: () => ({
          emoji: { name: '👀' },
          remove: async () => {
            reactions.push('removed 👀');
          },
        }),
      },
    },
    react: async (emoji: string) => {
      reactions.push(emoji);
    },
  };
  try {
    assert.equal(
      await new DiscussionHarvester(api).processAnalysis(message, DEFAULT_HARVESTING_POLICY),
      null,
    );
    assert.deepEqual(reactions, ['removed 👀', '⚠️']);
    assert.equal((await readdir(directory)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('scan failure never advances checkpoint; a successful no-decision retry can advance', async () => {
  const { DiscussionHarvester } = await import('./harvester.service.js');
  const { DEFAULT_HARVESTING_POLICY } = await import('@ggaddak/shared');
  const directory = await mkdtemp(join(tmpdir(), 'analysis-scan-'));
  let offline = true;
  let checkpointWrites = 0;
  const api = new BackendApiService('http://fixture', directory, async (url, init) => {
    if (String(url).endsWith('/checkpoint')) {
      if (init?.method === 'POST') checkpointWrites++;
      return Response.json({});
    }
    return offline
      ? new Response('', { status: 503 })
      : Response.json({ found: false, decisions: [] });
  });
  const channel: any = {
    id: 'channel',
    name: 'general',
    guildId: 'guild',
    messages: {
      fetch: async () =>
        new Map([
          [
            '100',
            {
              id: '100',
              createdTimestamp: 1,
              createdAt: new Date('2026-01-01'),
              author: { username: 'Lee' },
              content: 'SQLite를 채택합시다',
            },
          ],
        ]),
    },
  };
  try {
    const harvester = new DiscussionHarvester(api);
    await assert.rejects(harvester.scanChannel(channel, DEFAULT_HARVESTING_POLICY), /503/);
    assert.equal(checkpointWrites, 0);
    offline = false;
    assert.deepEqual(await harvester.scanChannel(channel, DEFAULT_HARVESTING_POLICY), {
      scannedCount: 1,
      decisionsCount: 0,
    });
    assert.equal(checkpointWrites, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
