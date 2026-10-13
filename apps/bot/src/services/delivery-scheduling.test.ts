import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BackendApiService,
  AnalysisDeliveryError,
  DeliveryOptions,
} from './backend-api.service.js';
import { DecisionHarvestingEngine } from './decision-harvesting-engine.js';
import { DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';

const options: DeliveryOptions = {
  maxAttempts: 2,
  initialDelayMs: 10,
  maxDelayMs: 100,
  timeoutMs: 50,
  jitter: 0,
};
const payload = (requestId: string, channelId = 'channel') => ({
  requestId,
  guildId: 'guild',
  channelId,
  rawMessages: [{ id: requestId, content: 'evidence' }],
});
const noDecision = () => Response.json({ found: false, decisions: [] });

test('shared delivery scheduler serializes different service instances and releases the channel during backoff', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-serial-'));
  let active = 0;
  let peak = 0;
  const sent: string[] = [];
  const transport: typeof fetch = async (_url, init) => {
    active++;
    peak = Math.max(peak, active);
    const id = JSON.parse(init!.body as string).requestId;
    sent.push(id);
    await new Promise(r => setTimeout(r, 5));
    active--;
    return id === 'first' ? new Response('', { status: 503 }) : noDecision();
  };
  const api = () =>
    new BackendApiService('http://fixture', directory, transport, undefined, 'service', options);
  try {
    const [first, second] = await Promise.allSettled([
      api().analyzeDiscussion(payload('first')),
      api().analyzeDiscussion(payload('second')),
    ]);
    assert.equal(first.status, 'rejected');
    assert.equal(second.status, 'fulfilled');
    assert.equal(peak, 1);
    assert.deepEqual([...sent].sort(), ['first', 'second']);
    await api().analyzeDiscussion(payload('later'));
    assert.equal(sent[sent.length - 1], 'later');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('crash recovery retains results, replay does not send again, and manual reanalysis has a new identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-replay-'));
  const sent: string[] = [];
  const transport: typeof fetch = async (_url, init) => {
    sent.push(JSON.parse(init!.body as string).requestId);
    return noDecision();
  };
  const api = () =>
    new BackendApiService('http://fixture', directory, transport, undefined, 'service', options);
  try {
    await api().analyzeDiscussion(payload('same'));
    assert.deepEqual(await api().analyzeDiscussion(payload('same')), {
      found: false,
      decisions: [],
    });
    assert.equal(sent.length, 1);
    const { requestId: _, ...manual } = payload('manual');
    await api().analyzeDiscussion({ ...manual, isManualOverride: true });
    await api().analyzeDiscussion({ ...manual, isManualOverride: true });
    assert.equal(new Set(sent).size, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('timeout releases the channel, exhausted failures survive restart and repeated retry commands do not reset attempts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-timeout-'));
  let calls = 0;
  let clock = 0;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    return JSON.parse(init!.body as string).requestId === 'blocked'
      ? new Promise(() => {})
      : noDecision();
  };
  const api = () =>
    new BackendApiService('http://fixture', directory, transport, () => clock, 'service', {
      ...options,
      timeoutMs: 10,
    });
  try {
    await assert.rejects(
      api().analyzeDiscussion(payload('blocked')),
      (e: AnalysisDeliveryError) => e.outcome === 'retry-pending',
    );
    await api().analyzeDiscussion(payload('later'));
    clock = 10;
    await api().retryPendingAnalyses();
    await assert.rejects(
      api().analyzeDiscussion(payload('blocked')),
      (e: AnalysisDeliveryError) => e.outcome === 'retained-failure',
    );
    await assert.rejects(api().retryAnalysisRequest('blocked', 'command-1'), /timeout/);
    await assert.rejects(api().retryAnalysisRequest('blocked', 'command-1'), /backoff/);
    assert.equal(calls, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('permanent HTTP errors are retained without automatic redelivery and service authentication is sent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-permanent-'));
  let calls = 0;
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (_url, init) => {
      calls++;
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer service');
      return new Response('', { status: 422 });
    },
    undefined,
    'service',
    options,
  );
  try {
    await assert.rejects(
      api.analyzeDiscussion(payload('permanent')),
      (e: AnalysisDeliveryError) => e.outcome === 'retained-failure',
    );
    await api.retryPendingAnalyses();
    assert.equal(calls, 1);
    const record = JSON.parse(
      await readFile(join(directory, (await readdir(directory))[0]), 'utf8'),
    );
    assert.equal(record.stopped, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('debounce replacement settles all callers; manual event serializes with active execution', async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const sink = {
    analyzeDiscussion: async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
      return { found: false, decisions: [] };
    },
  };
  const engine = new DecisionHarvestingEngine(sink);
  const message: any = { id: '100', channelId: 'debounce', content: 'agree' };
  const policy = { ...DEFAULT_HARVESTING_POLICY, debounceMs: 10 };
  const one = engine.harvest({ type: 'EVENT', message }, policy);
  const two = engine.harvest({ type: 'EVENT', message: { ...message, id: '101' } }, policy);
  const three = engine.harvest(
    { type: 'EVENT', message: { ...message, id: '102' }, isManualOverride: true },
    policy,
  );
  const four = new DecisionHarvestingEngine(sink).harvest(
    { type: 'EVENT', message: { ...message, id: '103' }, isManualOverride: true },
    policy,
  );
  const results = await Promise.all([one, two, three, four]);
  assert.deepEqual(
    results.map(r => r.outcome),
    ['merged', 'merged', 'completed-no-decision', 'completed-no-decision'],
  );
  assert.equal(calls, 2);
  assert.equal(peak, 1);
});

test('requests waiting for an occupied channel are durable before they execute', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-waiting-'));
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (_url, init) => {
      if (JSON.parse(init!.body as string).requestId === 'first') {
        entered();
        await gate;
      }
      return noDecision();
    },
    undefined,
    'service',
    { ...options, timeoutMs: 1000 },
  );
  try {
    const first = api.analyzeDiscussion(payload('first'));
    await started;
    const second = api.analyzeDiscussion(payload('second'));
    // Public journal boundary, without waiting for the occupied execution slot.
    for (
      let i = 0;
      i < 100 && (await readdir(directory)).filter(n => n.endsWith('.json')).length < 2;
      i++
    )
      await new Promise(r => setTimeout(r, 2));
    const records = await Promise.all(
      (await readdir(directory))
        .filter(n => n.endsWith('.json'))
        .map(async n => JSON.parse(await readFile(join(directory, n), 'utf8'))),
    );
    assert.equal(records.find(r => r.payload.requestId === 'second').attempts, 0);
    release();
    await Promise.all([first, second]);
  } finally {
    release();
    await rm(directory, { recursive: true, force: true });
  }
});

test('canceling pending debounce settles the caller and does not start analysis', async () => {
  let calls = 0;
  const engine = new DecisionHarvestingEngine({
    analyzeDiscussion: async () => {
      calls++;
      return { found: false, decisions: [] };
    },
  });
  const pending = engine.harvest(
    { type: 'EVENT', message: { id: 'cancel', channelId: 'cancel', content: 'agree' } as any },
    { ...DEFAULT_HARVESTING_POLICY, debounceMs: 10000 },
  );
  await engine.cancelPending();
  assert.equal((await pending).outcome, 'canceled');
  assert.equal(calls, 0);
});

test('startup scan, message, reaction, command-created engine and restart recovery share channel execution', async () => {
  const { DiscussionHarvester } = await import('./harvester.service.js');
  const { MessageHandler } = await import('../handlers/message.handler.js');
  const { ReactionHandler } = await import('../handlers/reaction.handler.js');
  const directory = await mkdtemp(join(tmpdir(), 'egress-entrypoints-'));
  let clock = 0;
  let offline = true;
  let active = 0;
  let peak = 0;
  const sent: string[] = [];
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (url, init) => {
      if (String(url).includes('/internal/monitoring'))
        return Response.json({ data: { channelIds: ['channel'] } });
      if (String(url).endsWith('/checkpoint')) return Response.json({});
      const body = JSON.parse(init!.body as string);
      sent.push(body.requestId);
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 3));
      active--;
      return offline ? new Response('', { status: 503 }) : noDecision();
    },
    () => clock,
    'service',
    { ...options, timeoutMs: 1000 },
  );
  const scanned: any = {
    id: '100',
    author: { id: 'user', username: 'Lee', bot: false },
    content: 'SQLite를 채택합시다',
    createdAt: new Date(0),
    createdTimestamp: 0,
  };
  const channel: any = {
    id: 'channel',
    name: 'general',
    guildId: 'guild',
    guild: { id: 'guild' },
    isTextBased: () => true,
    isThread: () => false,
    messages: {
      fetch: async (opts: any) =>
        opts.before || opts.after ? new Map() : new Map([['100', scanned]]),
    },
  };
  const message: any = {
    ...scanned,
    id: '200',
    channel,
    channelId: 'channel',
    guildId: 'guild',
    reactions: { cache: new Map() },
    react: async () => {},
  };
  const harvester = new DiscussionHarvester(api);
  const engine = new DecisionHarvestingEngine(api, harvester);
  const policy = { ...DEFAULT_HARVESTING_POLICY, debounceMs: 0 };
  try {
    await assert.rejects(api.analyzeDiscussion(payload('recover')), /503/);
    offline = false;
    clock = 100;
    const guild: any = { name: 'guild', channels: { cache: new Map([['channel', channel]]) } };
    await Promise.all([
      harvester.scanAllChannels({ guilds: { cache: new Map([['guild', guild]]) } } as any, policy, {
        full: true,
        requestId: 'startup',
      }),
      new MessageHandler(engine, async () => {}).handleMessage(message, policy),
      new ReactionHandler('📌', engine, async () => {}).handleReactionAdd(
        { message: { ...message, id: '201' }, emoji: { name: '📌' } } as any,
        { bot: false, username: 'Lee' } as any,
        policy,
      ),
      new DecisionHarvestingEngine(api, harvester).harvest(
        {
          type: 'SCAN',
          target: channel,
          options: { full: true, requestId: 'command', forceFullSync: true },
        },
        policy,
      ),
      api.retryPendingAnalyses(),
    ]);
    assert.equal(peak, 1);
    for (const id of ['recover', 'startup:100', 'command:100']) assert.ok(sent.includes(id));
    assert.ok(sent.some(id => id.startsWith('bot-')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stalled response body releases its channel after the configured deadline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'egress-body-timeout-'));
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (_url, init) => {
      if (JSON.parse(init!.body as string).requestId === 'stalled')
        return { ok: true, json: async () => new Promise(() => {}) } as Response;
      return noDecision();
    },
    undefined,
    'service',
    { ...options, timeoutMs: 10 },
  );
  try {
    const results = await Promise.allSettled([
      api.analyzeDiscussion(payload('stalled')),
      api.analyzeDiscussion(payload('later')),
    ]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Bot processing reactions cannot trigger human agreement and cleanup removes only the Bot user', async () => {
  const { ReactionHandler } = await import('../handlers/reaction.handler.js');
  const { DiscussionHarvester } = await import('./harvester.service.js');
  let calls = 0;
  const removed: string[] = [];
  const cached: any = {
    count: 3,
    me: true,
    emoji: { name: '👀' },
    users: {
      remove: async (id: string) => {
        removed.push(id);
      },
    },
    remove: async () => {
      throw new Error('must not remove users reactions');
    },
  };
  const message: any = {
    id: '100',
    channelId: 'channel',
    guildId: 'guild',
    client: { user: { id: 'bot' } },
    reactions: {
      cache: { reduce: (fn: any, initial: number) => fn(initial, cached), find: () => cached },
    },
  };
  const handler = new ReactionHandler(
    '📌',
    {
      harvest: async () => {
        calls++;
        return { success: true, decisions: [], decisionsCount: 0, messageCount: 0 };
      },
    },
    async () => {},
  );
  await handler.handleReactionAdd(
    { message, emoji: { name: '👀' } } as any,
    { bot: false, username: 'Lee' } as any,
    DEFAULT_HARVESTING_POLICY,
  );
  assert.equal(calls, 0);
  await new DiscussionHarvester({} as any).removeReactionSafely(message, '👀');
  assert.deepEqual(removed, ['bot']);
});

test('settlement and restart reaction reconciliation finish before the next channel execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reaction-settle-'));
  let finishCleanup!: () => void;
  let beginCleanup!: () => void;
  const cleanupStarted = new Promise<void>(resolve => {
    beginCleanup = resolve;
  });
  const cleanupGate = new Promise<void>(resolve => {
    finishCleanup = resolve;
  });
  const order: string[] = [];
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (_url, init) => {
      order.push(JSON.parse(init!.body as string).requestId);
      return noDecision();
    },
    undefined,
    'service',
    { ...options, timeoutMs: 1000 },
  );
  try {
    const first = api.analyzeDiscussion(payload('first'), undefined, undefined, async () => {
      beginCleanup();
      await cleanupGate;
      order.push('first cleanup');
    });
    await cleanupStarted;
    const second = api.analyzeDiscussion(payload('second'));
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(order, ['first']);
    finishCleanup();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first', 'first cleanup', 'second']);
  } finally {
    finishCleanup();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed manual harvest settles as a result and queued same-channel work still completes', async () => {
  const engine = new DecisionHarvestingEngine({
    analyzeDiscussion: async payload => {
      if (payload.rawMessages[0].id === 'failed') throw new Error('analysis unavailable');
      return { found: false, decisions: [] };
    },
  });
  const trigger = (id: string) => ({
    type: 'EVENT' as const,
    message: { id, channelId: 'failure-release', content: 'agree' } as any,
    isManualOverride: true,
  });
  const results = await Promise.all([
    engine.harvest(trigger('failed')),
    engine.harvest(trigger('later')),
  ]);
  assert.deepEqual(
    results.map(result => result.outcome),
    ['retained-failure', 'completed-no-decision'],
  );
  assert.equal(results[0].summary, 'analysis unavailable');
});
