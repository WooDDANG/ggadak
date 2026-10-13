import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackendApiService } from './backend-api.service.js';
import { DecisionHarvestingEngine } from './decision-harvesting-engine.js';
import { DiscussionHarvester } from './harvester.service.js';
import { DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';

test('failed early range blocks later completion across restart; response-loss and old acknowledgements recover monotonically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scan-coverage-'));
  let checkpoint = '100';
  let fail = true;
  let loseAck = false;
  const completed: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/checkpoint')) {
      if (init?.method === 'POST') {
        const next = JSON.parse(init.body as string).lastMessageId;
        if (BigInt(next) > BigInt(checkpoint)) checkpoint = next;
        if (loseAck) {
          loseAck = false;
          throw new Error('response lost');
        }
      }
      return Response.json({ lastMessageId: checkpoint });
    }
    const body = JSON.parse(init!.body as string);
    if (body.requestId === 'first' && fail) return new Response('', { status: 503 });
    completed.push(body.requestId);
    return Response.json({ found: false, decisions: [] });
  };
  const api = () => new BackendApiService('http://fixture', directory, transport);
  const payload = (id: string) => ({
    requestId: id,
    channelId: 'channel',
    guildId: 'guild',
    rawMessages: [{ id, author: 'Lee', content: 'context' }],
  });
  try {
    await assert.rejects(
      api().analyzeDiscussion(payload('first'), undefined, {
        afterMessageId: '100',
        startMessageId: '101',
        endMessageId: '200',
      }),
    );
    await api().analyzeDiscussion(payload('later'), undefined, {
      afterMessageId: '200',
      startMessageId: '201',
      endMessageId: '300',
    });
    await api().recoverScanCheckpoints();
    assert.equal(checkpoint, '100');
    assert.equal(await api().getScanBoundary('channel', checkpoint), '300');
    fail = false;
    await api().retryAnalysisRequest('first');
    loseAck = true;
    await assert.rejects(api().recoverScanCheckpoints(), /lost/);
    assert.equal(checkpoint, '300');
    await api().recoverScanCheckpoints();
    assert.equal(checkpoint, '300');
    assert.deepEqual(completed, ['later', 'first']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a bounded manual scan cannot skip an omitted gap; event analysis never advances scan coverage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scan-gap-'));
  let checkpoint = '100';
  const api = new BackendApiService('http://fixture', directory, async (url, init) => {
    if (String(url).endsWith('/checkpoint')) {
      if (init?.method === 'POST') checkpoint = JSON.parse(init.body as string).lastMessageId;
      return Response.json({ lastMessageId: checkpoint });
    }
    return Response.json({ found: false, decisions: [] });
  });
  try {
    await api.analyzeDiscussion({ requestId: 'event', channelId: 'channel', rawMessages: [] });
    await api.analyzeDiscussion(
      { requestId: 'bounded', channelId: 'channel', rawMessages: [] },
      undefined,
      { afterMessageId: '199', startMessageId: '200', endMessageId: '300' },
    );
    await api.recoverScanCheckpoints();
    assert.equal(checkpoint, '100');
    assert.equal(await api.getScanBoundary('channel', '100'), '100');
    await api.analyzeDiscussion(
      { requestId: 'gap', channelId: 'channel', rawMessages: [] },
      undefined,
      { afterMessageId: '100', startMessageId: '101', endMessageId: '200' },
    );
    await api.recoverScanCheckpoints();
    assert.equal(checkpoint, '300');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('initial bounded scan preserves large snowflake ordering and declares only the actual latest messages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scan-bound-'));
  const sent: any[] = [];
  let checkpoint: string | null = null;
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (url, init) => {
      if (String(url).includes('/monitoring'))
        return Response.json({ data: { channelIds: ['channel'] } });
      if (String(url).endsWith('/checkpoint')) {
        if (init?.method === 'POST') checkpoint = JSON.parse(init.body as string).lastMessageId;
        return Response.json({ lastMessageId: checkpoint });
      }
      sent.push(JSON.parse(init!.body as string));
      return Response.json({ found: false, decisions: [] });
    },
    undefined,
    'service',
  );
  const base = 1400000000000000000n;
  const messages = Array.from({ length: 8 }, (_, i) => ({
    id: (base + BigInt(i)).toString(),
    author: { id: 'user', username: 'Lee' },
    content: 'context',
    createdAt: new Date(),
    createdTimestamp: Date.now(),
  })).reverse();
  const channel: any = {
    id: 'channel',
    name: 'general',
    guild: { id: 'guild' },
    messages: { fetch: async () => new Map(messages.map(m => [m.id, m])) },
  };
  try {
    await new DecisionHarvestingEngine(api, new DiscussionHarvester(api)).harvest(
      { type: 'SCAN', target: channel, options: { initialOnly: true, full: true } },
      { ...DEFAULT_HARVESTING_POLICY, initialScanLimit: 3 },
    );
    assert.deepEqual(
      sent[0].rawMessages.map((m: any) => m.id),
      [5n, 6n, 7n].map(i => (base + i).toString()),
    );
    assert.equal(checkpoint, (base + 7n).toString());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('pagination traverses backwards without precision loss and retains later pages around a failed range', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scan-pages-'));
  const base = 1400000000000000000n;
  let checkpoint = base.toString();
  const sent: string[] = [];
  const messages = Array.from({ length: 205 }, (_, i) => ({
    id: (base + BigInt(i + 1)).toString(),
    author: { username: 'Lee' },
    content: 'context',
    createdAt: new Date(),
    createdTimestamp: Date.now(),
  })).reverse();
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (url, init) => {
      if (String(url).includes('/monitoring'))
        return Response.json({ data: { channelIds: ['channel'] } });
      if (String(url).endsWith('/checkpoint')) {
        if (init?.method === 'POST') checkpoint = JSON.parse(init.body as string).lastMessageId;
        return Response.json({ lastMessageId: checkpoint });
      }
      const body = JSON.parse(init!.body as string);
      sent.push(body.triggerMessageId);
      return body.triggerMessageId === (base + 100n).toString()
        ? new Response('', { status: 503 })
        : Response.json({ found: false, decisions: [] });
    },
    undefined,
    'service',
  );
  const before: string[] = [];
  const channel: any = {
    id: 'channel',
    name: 'general',
    guild: { id: 'guild' },
    messages: {
      fetch: async (opts: any) => {
        if (opts.before) before.push(opts.before);
        const filtered = messages
          .filter(m => !opts.before || BigInt(m.id) < BigInt(opts.before))
          .slice(0, 100);
        return new Map(filtered.map(m => [m.id, m]));
      },
    },
  };
  try {
    await assert.rejects(
      new DecisionHarvestingEngine(api, new DiscussionHarvester(api)).harvest(
        { type: 'SCAN', target: channel },
        DEFAULT_HARVESTING_POLICY,
      ),
      /1 pending/,
    );
    assert.deepEqual(
      sent,
      [100n, 200n, 205n].map(n => (base + n).toString()),
    );
    assert.equal(checkpoint, base.toString());
    assert.deepEqual(
      before,
      [106n, 6n].map(n => (base + n).toString()),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unavailable checkpoint read cannot be mistaken for a new bounded starting boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scan-read-failure-'));
  let outage = false;
  let writes = 0;
  const api = new BackendApiService('http://fixture', directory, async (url, init) => {
    if (String(url).endsWith('/checkpoint')) {
      if (init?.method === 'POST') {
        writes++;
        return Response.json({});
      }
      return outage ? new Response('', { status: 503 }) : Response.json({ lastMessageId: '100' });
    }
    return Response.json({ found: false, decisions: [] });
  });
  try {
    await api.analyzeDiscussion(
      { requestId: 'bounded', channelId: 'channel', rawMessages: [] },
      undefined,
      { afterMessageId: '199', startMessageId: '200', endMessageId: '300' },
    );
    outage = true;
    await assert.rejects(api.recoverScanCheckpoints(), /503/);
    assert.equal(writes, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
