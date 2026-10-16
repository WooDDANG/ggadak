import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendApiService } from './backend-api.service.js';
import { ChannelTransfer } from './channel-transfer.js';

test('Bot completes receipt before AI and independently reconciles its result after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'async-delivery-'));
  let posts = 0,
    feedback = 0;
  const transport: typeof fetch = async url => {
    if (String(url).includes('/receipts')) {
      posts++;
      return Response.json({ data: { requestId: 'request', state: 'pending' } }, { status: 202 });
    }
    if (String(url).includes('/results?'))
      return Response.json({
        data: [
          {
            requestId: 'request',
            state: 'completed',
            result: { found: true, decisions: [{ id: 'candidate' }] },
          },
        ],
      });
    return Response.json({ data: null });
  };
  try {
    const api = new BackendApiService(
      'http://fixture',
      dir,
      transport,
      undefined,
      'service',
      undefined,
      undefined,
      true,
    );
    api.observeDeliveries(async () => {
      feedback++;
    });
    const response = await api.analyzeDiscussion({
      requestId: 'request',
      guildId: 'guild',
      channelId: 'channel',
      rawMessages: [{ id: '100', author: 'Lee', content: '결정' }],
    });
    assert.equal(response.accepted, true);
    assert.equal(posts, 1);
    assert.equal(feedback, 0);
    const restarted = new BackendApiService(
      'http://fixture',
      dir,
      transport,
      undefined,
      'service',
      undefined,
      undefined,
      true,
    );
    restarted.observeDeliveries(async () => {
      feedback++;
    });
    await restarted.reconcileResults();
    await restarted.reconcileResults();
    assert.equal(feedback, 1);
    assert.equal(posts, 1);
    await restarted.cleanupCompleted(0);
    const replay = await restarted.analyzeDiscussion({
      requestId: 'request',
      guildId: 'guild',
      channelId: 'channel',
      rawMessages: [{ id: '100', author: 'Lee', content: '결정' }],
    });
    assert.equal(replay.accepted, true);
    assert.equal(posts, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Bot refuses a new delivery when its durable journal budget is exhausted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-capacity-'));
  let calls = 0;
  const previous = process.env.BOT_JOURNAL_MAX_BYTES;
  process.env.BOT_JOURNAL_MAX_BYTES = '1';
  try {
    const api = new BackendApiService(
      'http://fixture',
      dir,
      async () => {
        calls++;
        return Response.json({ data: { requestId: 'full', state: 'pending' } }, { status: 202 });
      },
      undefined,
      'service',
      undefined,
      undefined,
      true,
    );
    await assert.rejects(
      api.analyzeDiscussion({
        requestId: 'full',
        guildId: 'guild',
        channelId: 'channel',
        rawMessages: [{ id: '100', content: '내용' }],
      }),
      /journal capacity/,
    );
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.BOT_JOURNAL_MAX_BYTES;
    else process.env.BOT_JOURNAL_MAX_BYTES = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('channel transfer pages to disk, uploads in order and seals without waiting for AI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'channel-transfer-'));
  const sent: any[] = [];
  const messages = Array.from({ length: 205 }, (_, i) => ({
    id: String(i + 1),
    content: '의사결정 내용',
    author: { username: 'Lee', bot: false },
    createdAt: new Date('2026-01-01'),
    reactions: { cache: new Map() },
  }));
  const api = new BackendApiService(
    'http://fixture',
    dir,
    async (url, init) => {
      const path = String(url);
      if (path.includes('/receipts')) {
        const b = JSON.parse(String(init?.body));
        sent.push(b);
        return Response.json(
          { data: { requestId: b.input.requestId, state: 'receiving' } },
          { status: 202 },
        );
      }
      if (path.includes('/seal')) return Response.json({ data: { sealed: true, missing: [] } });
      if (path.includes('/checkpoint')) return Response.json({ lastMessageId: null });
      return Response.json({ data: { id: 'scan', state: 'receiving' } });
    },
    undefined,
    'service',
    undefined,
    undefined,
    true,
  );
  const channel: any = {
    id: 'channel',
    guild: { id: 'guild' },
    name: 'general',
    messages: {
      fetch: async ({ before, limit }: any) =>
        new Map(
          messages
            .filter(m => !before || BigInt(m.id) < BigInt(before))
            .slice(-limit)
            .reverse()
            .map(m => [m.id, m]),
        ),
    },
  };
  try {
    const transfer = new ChannelTransfer(api);
    const result = await transfer.run(channel, { full: true, requestId: 'scan' });
    assert.equal(result.scannedCount, 205);
    assert.equal(result.pendingAnalysis, true);
    assert.equal(sent[0].input.rawMessages[0].id, '1');
    assert.equal(sent.at(-1).range.endMessageId, '205');
    const count = sent.length;
    await transfer.run(channel, { full: true, requestId: 'scan' });
    assert.equal(sent.length, count);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('idle delivery synchronization sends no repeated snapshot changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'delivery-delta-'));
  const snapshots: any[] = [];
  const api = new BackendApiService(
    'http://fixture',
    dir,
    async (url, init) => {
      if (String(url).includes('/sync')) {
        snapshots.push(JSON.parse(String(init?.body)).requests);
        return Response.json({ data: [] });
      }
      return Response.json({ found: false, decisions: [] });
    },
    undefined,
    'service',
    undefined,
    undefined,
    false,
  );
  try {
    await api.analyzeDiscussion({
      requestId: 'legacy',
      guildId: 'guild',
      channelId: 'channel',
      rawMessages: [{ id: '100', content: '결정' }],
    });
    await api.synchronizeDeliveryStatus();
    await api.synchronizeDeliveryStatus();
    assert.equal(snapshots[0].length, 1);
    assert.equal(snapshots[1].length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
