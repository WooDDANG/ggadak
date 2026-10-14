import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendApiService } from './backend-api.service.js';

test('terminal analysis is retained across restart and explicit delivery retry cannot reset it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'terminal-analysis-'));
  let calls = 0;
  try {
    const api = new BackendApiService('http://fixture', directory, async () => { calls++; return new Response('', { status: 422 }); });
    await assert.rejects(api.analyzeDiscussion({ requestId: 'terminal', guildId: 'guild', channelId: 'channel', rawMessages: [{ id: '100', content: 'Redis를 검토하자' }] }), /422/);
    const restarted = new BackendApiService('http://fixture', directory, async () => { calls++; return Response.json({ found: false, decisions: [] }); });
    await assert.rejects(restarted.retryAnalysisRequest('terminal', 'retry-command'), /new manual analysis/);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
    const retriedResult = await restarted.retryAnalysisRequest(sent[0].requestId);
    const retried = [{ result: retriedResult }];
    assert.equal(retried[0].result.decisions[0].id, 'candidate');
    assert.deepEqual(sent[1], sent[0]);
    assert.ok(sent[0].requestId);
    assert.equal((await readdir(directory)).length, 1);
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
    async url =>
      String(url).includes('/internal/monitoring')
        ? Response.json({ data: { channelIds: ['channel'] } })
        : new Response('', { status: 503 }),
    undefined,
    'test-service',
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
    client: { user: { id: 'bot' } },
    reactions: {
      cache: {
        values: () => [],
        find: (predicate: (r: any) => boolean) => {
          const reaction = {
            emoji: { name: '👀' },
            users: {
              remove: async () => {
                reactions.push('removed 👀');
              },
            },
          };
          return predicate(reaction) ? reaction : undefined;
        },
      },
    },
    react: async (emoji: string) => {
      reactions.push(emoji);
    },
  };
  try {
    await assert.rejects(
      new DiscussionHarvester(api).processAnalysis(message, DEFAULT_HARVESTING_POLICY),
      /503/,
    );
    assert.deepEqual(reactions, ['👀', 'removed 👀']);
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
  let lastMessageId: string | null = null;
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (url, init) => {
      if (String(url).includes('/internal/monitoring'))
        return Response.json({ data: { channelIds: ['channel'] } });
      if (String(url).endsWith('/checkpoint')) {
        if (init?.method === 'POST') {
          checkpointWrites++;
          lastMessageId = JSON.parse(init.body as string).lastMessageId;
        }
        return Response.json({ lastMessageId });
      }
      return offline
        ? new Response('', { status: 503 })
        : Response.json({ found: false, decisions: [] });
    },
    undefined,
    'test-service',
  );
  const channel: any = {
    id: 'channel',
    name: 'general',
    guildId: 'guild',
    guild: { id: 'guild' },
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
    const retained = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(join(directory, (await readdir(directory))[0]), 'utf8'),
    );
    await api.retryAnalysisRequest(retained.payload.requestId);
    assert.deepEqual(await harvester.scanChannel(channel, DEFAULT_HARVESTING_POLICY), {
      scannedCount: 0,
      decisionsCount: 0,
    });
    assert.equal(checkpointWrites, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('permanent failure retained first in journal does not starve a later legacy pending delivery', async () => {
  const { writeFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'analysis-fairness-'));
  const sent: string[] = [];
  try {
    for (const [filename, requestId] of [
      ['00.json', 'bad'],
      ['01.json', 'good'],
    ]) {
      await writeFile(join(directory, filename), JSON.stringify({ requestId, rawMessages: [] }));
    }
    const api = new BackendApiService('http://fixture', directory, async (_url, init) => {
      const id = JSON.parse(init!.body as string).requestId;
      sent.push(id);
      return id === 'bad'
        ? new Response('', { status: 400 })
        : Response.json({ found: false, decisions: [] });
    });
    assert.deepEqual(await api.retryPendingAnalyses(1), []);
    assert.equal((await api.retryPendingAnalyses(1))[0].payload.requestId, 'good');
    assert.deepEqual(sent, ['bad', 'good']);
    assert.equal((await readdir(directory)).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('transient retry budget and exponential backoff survive restart; explicit retry preserves original ID and payload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'analysis-budget-'));
  let clock = 1000;
  let online = false;
  const sent: any[] = [];
  const transport: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(init!.body as string));
    return online
      ? Response.json({ found: true, decisions: [{ id: 'recovered' }] })
      : new Response('', { status: 503 });
  };
  const create = () =>
    new BackendApiService('http://fixture', directory, transport, () => clock, undefined, {
      maxAttempts: 3,
      initialDelayMs: 60000,
      maxDelayMs: 300000,
      timeoutMs: 50000,
      jitter: 0,
    });
  const payload = {
    requestId: 'budget',
    rawMessages: [{ id: '100', content: 'original' }],
    traceId: 'original-trace',
  };
  try {
    await assert.rejects(create().analyzeDiscussion(payload), /503/);
    await create().retryPendingAnalyses();
    assert.equal(sent.length, 1);
    clock += 60_000;
    await create().retryPendingAnalyses();
    assert.equal(sent.length, 2);
    clock += 60_000;
    await create().retryPendingAnalyses();
    assert.equal(sent.length, 2);
    clock += 60_000;
    await create().retryPendingAnalyses();
    assert.equal(sent.length, 3);
    clock += 86400_000;
    await create().retryPendingAnalyses();
    assert.equal(sent.length, 3);
    assert.equal((await readdir(directory)).length, 1);
    online = true;
    assert.equal((await create().retryAnalysisRequest('budget')).decisions[0].id, 'recovered');
    assert.deepEqual(sent, [payload, payload, payload, payload]);
    assert.equal((await readdir(directory)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
