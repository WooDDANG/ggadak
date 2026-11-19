import { AnalysisDeliveryService } from '../src/services/analysis-delivery.service.js';
import { test, expect } from 'vitest';
import { createApp } from '../src/server.js';
import http from 'node:http';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fixtureAiAdapter } from '../src/test-support/ai-fixture.js';
import { AnalysisQueueService } from '../src/services/analysis-queue.service.js';
import { DiscussionService } from '../src/services/discussion.service.js';
import { DecisionExtractorCore } from '../src/engine/extractor-core.js';
import { SyncJobService } from '../src/services/sync-job.service.js';
import { AppError } from '../src/errors/AppError.js';

const input = {
  requestId: 'receipt-1',
  guildId: 'guild',
  channelId: 'channel',
  rawMessages: [
    {
      id: '100',
      author: 'Lee',
      content: 'Redis를 사용하기로 결정했습니다. 이유는 응답 속도입니다.',
    },
  ],
};
test('durable receipt returns before AI, survives restart and rejects changed replay', async () => {
  const db = await isolatedRepository();
  const app = await createApp(
    db.repo,
    fixtureAiAdapter({
      analyzeTranscript: async () => ({ found: false, summary: 'none', decisions: [] }),
    }),
    { serviceToken: 'service' },
  );
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/internal/analysis-queue`;
  const send = (body: unknown) =>
    fetch(`${base}/receipts`, {
      method: 'POST',
      headers: { Authorization: 'Bearer service', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const accepted = await send({ input });
    expect(accepted.status).toBe(202);
    expect(((await accepted.json()) as any).data.state).toBe('pending');
    expect((await send({ input })).status).toBe(202);
    expect(
      (
        await send({
          input: { ...input, rawMessages: [{ ...input.rawMessages[0], content: 'changed' }] },
        })
      ).status,
    ).toBe(409);
    const restarted = await createApp(
      db.repo,
      fixtureAiAdapter({
        analyzeTranscript: async () => ({ found: false, summary: 'none', decisions: [] }),
      }),
      { serviceToken: 'service' },
    );
    await restarted.locals.analysisQueue.runOnce();
    const response = await fetch(`${base}/results?ids=receipt-1`, {
      headers: { Authorization: 'Bearer service' },
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).data[0]).toMatchObject({
      requestId: 'receipt-1',
      state: 'completed',
      inputRetained: true,
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('slow AI does not block receipts and independent workers share one execution slot', async () => {
  const db = await isolatedRepository();
  let started = false,
    release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => {
      started = true;
      await gate;
      return { summary: 'none', decisions: [] };
    },
  });
  const discussion = new DiscussionService(db.repo, ai, new DecisionExtractorCore());
  const queue = new AnalysisQueueService(db.repo, discussion),
    other = new AnalysisQueueService(db.repo, discussion);
  let running: Promise<void> | undefined;
  try {
    await queue.receive({ input });
    running = queue.runOnce();
    for (let i = 0; i < 200 && !started; i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(started).toBe(true);
    await other.receive({ input: { ...input, requestId: 'parallel', channelId: 'other' } });
    await other.runOnce();
    expect((await queue.results(['parallel']))[0]).toMatchObject({
      state: 'retry',
      attempts: 0,
      errorCategory: 'analysis-capacity',
    });
    expect((await queue.results([input.requestId]))[0].state).toBe('processing');
  } finally {
    release();
    await running;
    await db.cleanup();
  }
});

test('provider retry-after defers analysis in BE without retransmitting stored input', async () => {
  const db = await isolatedRepository();
  let now = Date.now(),
    unavailable = true,
    calls = 0;
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => {
      calls++;
      if (unavailable) throw new AppError('provider limited', 503, { retryAfterMs: 30000 });
      return { summary: 'none', decisions: [] };
    },
  });
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
    {},
    () => now,
  );
  try {
    await queue.receive({ input });
    await queue.runOnce();
    const failed = (await queue.results([input.requestId]))[0];
    expect(failed.state).toBe('retry');
    expect(Date.parse(failed.nextAttemptAt)).toBeGreaterThanOrEqual(now + 30000);
    await queue.runOnce();
    expect(calls).toBe(1);
    now += 31000;
    unavailable = false;
    await queue.runOnce();
    expect((await queue.results([input.requestId]))[0].state).toBe('completed');
    expect(calls).toBe(2);
  } finally {
    await db.cleanup();
  }
});

test('a provider failure with capacity-like wording still consumes a retry attempt', async () => {
  const db = await isolatedRepository();
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => {
      throw new AppError('Analysis capacity busy', 503);
    },
  });
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
  );
  try {
    await queue.receive({ input });
    await queue.runOnce();
    expect((await queue.results([input.requestId]))[0]).toMatchObject({
      state: 'retry',
      attempts: 1,
      errorCategory: 'provider-or-storage',
    });
  } finally {
    await db.cleanup();
  }
});

test('BE permits channel B transfer while channel A is queued and completes the job after analysis', async () => {
  const db = await isolatedRepository();
  let failing = true;
  let clock = Date.now();
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(
      db.repo,
      fixtureAiAdapter({
        analyzeTranscript: async () => {
          if (failing) throw new AppError('provider unavailable', 503);
          return { summary: 'none', decisions: [] };
        },
      }),
      new DecisionExtractorCore(),
    ),
    { maxAttempts: 1 },
    () => clock,
  );
  const jobs = new SyncJobService(db.repo);
  try {
    await db.client.guild.create({
      data: {
        id: 'guild',
        name: 'Guild',
        channels: {
          create: [
            { id: 'channel', name: 'A' },
            { id: 'other', name: 'B' },
          ],
        },
      },
    });
    const job = await jobs.create('guild', true),
      a = (await jobs.claim(true))!;
    expect(a.channelIds).toEqual(['channel']);
    await queue.startScan({
      id: 'A',
      guildId: 'guild',
      channelId: 'channel',
      upperMessageId: '100',
      afterMessageId: '0',
      jobId: job.jobId,
      jobOwner: a.owner,
    });
    await queue.receive({
      input,
      scanId: 'A',
      rangeIndex: 0,
      range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
    });
    await queue.sealScan('A', 1);
    await jobs.update(job.jobId, {
      owner: a.owner,
      channelResult: {
        channelId: 'channel',
        status: 'RECEIVED',
        messagesScanned: 1,
        decisionsFound: 0,
      },
      release: true,
    });
    const b = (await jobs.claim(true))!;
    expect(b.channelIds).toEqual(['other']);
    expect((await queue.results([input.requestId]))[0].state).toBe('pending');
    await queue.startScan({
      id: 'B',
      guildId: 'guild',
      channelId: 'other',
      upperMessageId: '0',
      afterMessageId: '0',
      jobId: job.jobId,
      jobOwner: b.owner,
    });
    await queue.sealScan('B', 0);
    await jobs.update(job.jobId, {
      owner: b.owner,
      channelResult: {
        channelId: 'other',
        status: 'RECEIVED',
        messagesScanned: 0,
        decisionsFound: 0,
      },
      release: true,
    });
    expect(await jobs.get(job.jobId, 'guild')).toMatchObject({
      status: 'PROCESSING',
      receivedChannels: 2,
    });
    await queue.runOnce();
    expect(await jobs.get(job.jobId, 'guild')).toMatchObject({
      status: 'FAILED',
      failedChannels: 1,
    });
    failing = false;
    await new AnalysisDeliveryService(db.repo).retry('guild', input.requestId, 'retry-summary');
    clock += 300001;
    await queue.runOnce();
    expect(await jobs.get(job.jobId, 'guild')).toMatchObject({
      status: 'COMPLETED',
      completedChannels: 2,
    });
  } finally {
    await db.cleanup();
  }
});

test('exhausted channel transfer closes the job and an explicit resume preserves its identity', async () => {
  const db = await isolatedRepository();
  const jobs = new SyncJobService(db.repo);
  try {
    await db.client.guild.create({
      data: { id: 'guild', name: 'Guild', channels: { create: { id: 'channel', name: 'A' } } },
    });
    const job = await jobs.create('guild', true),
      claim = (await jobs.claim(true))!;
    await jobs.update(job.jobId, {
      owner: claim.owner,
      channelResult: {
        channelId: 'channel',
        status: 'FAILED',
        messagesScanned: 0,
        decisionsFound: 0,
        errorMessage: 'capacity',
      },
      release: true,
    });
    expect(await jobs.get(job.jobId, 'guild')).toMatchObject({ status: 'FAILED' });
    expect(await jobs.resume(job.jobId, 'guild', 'channel')).toMatchObject({
      jobId: job.jobId,
      status: 'QUEUED',
    });
    const resumed = (await jobs.claim(true))!;
    expect(resumed.jobId).toBe(job.jobId);
    expect(resumed.channelIds).toEqual(['channel']);
    expect(resumed.owner).not.toBe(claim.owner);
    await expect(jobs.update(job.jobId, { owner: claim.owner })).rejects.toThrow(/lease/);
  } finally {
    await db.cleanup();
  }
});

test('channel receipt waits for a complete seal, selectively reports gaps and advances only analyzed coverage', async () => {
  const db = await isolatedRepository();
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => ({ summary: 'none', decisions: [] }),
  });
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
  );
  try {
    await queue.startScan({
      id: 'scan',
      guildId: 'guild',
      channelId: 'channel',
      upperMessageId: '200',
      afterMessageId: '0',
    });
    await queue.receive({
      input,
      scanId: 'scan',
      rangeIndex: 0,
      range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
    });
    await queue.runOnce();
    expect((await queue.results(['receipt-1']))[0].state).toBe('receiving');
    expect(await queue.sealScan('scan', 2)).toMatchObject({ sealed: false, missing: [1] });
    await queue.receive({
      input: {
        ...input,
        requestId: 'receipt-2',
        rawMessages: [{ ...input.rawMessages[0], id: '200' }],
      },
      scanId: 'scan',
      rangeIndex: 1,
      range: { afterMessageId: '100', startMessageId: '200', endMessageId: '200' },
    });
    expect(await queue.sealScan('scan', 2)).toMatchObject({ sealed: true, missing: [] });
    await queue.runOnce();
    await queue.runOnce();
    expect((await queue.results(['receipt-1', 'receipt-2'])).map(r => r.state)).toEqual([
      'completed',
      'completed',
    ]);
    expect(await db.repo.getCheckpoint('channel')).toBe('200');
  } finally {
    await db.cleanup();
  }
});

test('세션 검증 실패 기록이 남고, 재시작 뒤 다음 Scan Range까지 진행한다', async () => {
  const db = await isolatedRepository();
  let now = Date.now();
  let fixed = false;
  const recoveredTranscripts: string[] = [];
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => ({ summary: '결정 없음', decisions: [] }),
  });
  const extract = ai.extractGraph;
  const brokenGraph = {
    summary: '고립된 근거',
    nodes: [{ id: 'reason', type: 'Rationale', summary: '비용 절감' }],
    edges: [],
    discussionProblems: [],
  };
  ai.extractGraph = (transcript, context) => {
    if (fixed) recoveredTranscripts.push(transcript);
    return !fixed && transcript.includes('Redis')
      ? Promise.resolve({ value: brokenGraph })
      : extract(transcript, context);
  };
  ai.repairGraph = async () => ({ value: brokenGraph });
  const worker = () =>
    new AnalysisQueueService(
      db.repo,
      new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
      {},
      () => now,
    );
  try {
    const queue = worker();
    await queue.startScan({
      id: 'degraded',
      guildId: 'guild',
      channelId: 'channel',
      upperMessageId: '200',
      afterMessageId: '0',
    });
    await queue.receive({
      input,
      scanId: 'degraded',
      rangeIndex: 0,
      range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
    });
    await queue.receive({
      input: {
        ...input,
        requestId: 'receipt-2',
        rawMessages: [{ id: '200', author: 'Lee', content: 'PostgreSQL을 사용합니다.' }],
      },
      scanId: 'degraded',
      rangeIndex: 1,
      range: { afterMessageId: '100', startMessageId: '200', endMessageId: '200' },
    });
    await queue.sealScan('degraded', 2);
    await queue.runOnce();
    const restarted = worker();
    expect((await restarted.results(['receipt-1']))[0]).toMatchObject({
      state: 'completed',
      result: {
        decisions: [],
        skippedSessions: [{ kind: 'graph-structure', messageIds: ['100'] }],
      },
    });
    expect(await db.repo.getCheckpoint('channel')).toBe('100');
    await restarted.runOnce();
    expect(await db.repo.getCheckpoint('channel')).toBe('200');
    fixed = true;
    await restarted.recoverOnce();
    expect(recoveredTranscripts).toHaveLength(0);
    now += 61_000;
    await Promise.all([restarted.recoverOnce(), worker().recoverOnce()]);
    expect(recoveredTranscripts).toHaveLength(1);
    expect(recoveredTranscripts[0]).toContain('Redis');
    expect(recoveredTranscripts[0]).not.toContain('PostgreSQL');
    const discussion = new DiscussionService(db.repo, ai, new DecisionExtractorCore());
    expect((await discussion.getStatus('receipt-1', 'guild')).sessions[0].recovery?.state).toBe(
      'recovered',
    );
    expect(await db.repo.getCheckpoint('channel')).toBe('200');
  } finally {
    await db.cleanup();
  }
});

test('partial oversized channel fails explicitly and resumes after capacity change', async () => {
  const db = await isolatedRepository();
  const discussion = new DiscussionService(
    db.repo,
    fixtureAiAdapter({ analyzeTranscript: async () => ({ summary: 'none', decisions: [] }) }),
    new DecisionExtractorCore(),
  );
  const queue = new AnalysisQueueService(db.repo, discussion, { maxChannelBytes: 1 });
  try {
    await queue.startScan({
      id: 'large',
      guildId: 'guild',
      channelId: 'channel',
      upperMessageId: '100',
      afterMessageId: '0',
    });
    const body = {
      input,
      scanId: 'large',
      rangeIndex: 0,
      range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
    };
    await expect(queue.receive(body)).rejects.toMatchObject({ statusCode: 413 });
    expect(await queue.scanStatus('large')).toMatchObject({ state: 'capacity-exceeded' });
    const expanded = new AnalysisQueueService(db.repo, discussion, { maxChannelBytes: 10000 });
    await expanded.receive(body);
    expect(await expanded.sealScan('large', 1)).toMatchObject({ sealed: true });
  } finally {
    await db.cleanup();
  }
});

test('cleanup retains unacknowledged results and permanent replay identity', async () => {
  const db = await isolatedRepository();
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(
      db.repo,
      fixtureAiAdapter({ analyzeTranscript: async () => ({ summary: 'none', decisions: [] }) }),
      new DecisionExtractorCore(),
    ),
    { retentionMs: 0 },
  );
  try {
    await queue.receive({ input });
    await queue.runOnce();
    await queue.cleanup();
    expect((await queue.results([input.requestId]))[0].inputRetained).toBe(true);
    await queue.acknowledge([input.requestId]);
    await queue.cleanup();
    expect((await queue.results([input.requestId]))[0].inputRetained).toBe(false);
    expect(await queue.receive({ input })).toMatchObject({
      state: 'completed',
      inputRetained: false,
    });
    expect(await queue.metrics()).toMatchObject({ pending: 0, retainedBytes: 0 });
  } finally {
    await db.cleanup();
  }
});

test('bounded cleanup advances past completed ranges blocked by checkpoint gaps', async () => {
  const db = await isolatedRepository();
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(
      db.repo,
      fixtureAiAdapter({ analyzeTranscript: async () => ({ summary: 'none', decisions: [] }) }),
      new DecisionExtractorCore(),
    ),
    { retentionMs: 0 },
  );
  try {
    for (let i = 0; i < 51; i++)
      await db.client.analysisReceipt.create({
        data: {
          id: i === 50 ? 'z-eligible' : `blocked-${String(i).padStart(2, '0')}`,
          fingerprint: 'retained',
          guildId: 'guild',
          channelId: 'gap',
          inputJson: '{}',
          inputBytes: 2,
          state: 'completed',
          completedAt: new Date(1),
          acknowledgedAt: new Date(1),
          ...(i === 50 ? {} : { rangeJson: JSON.stringify({ endMessageId: '100' }) }),
        },
      });
    expect(await queue.cleanup()).toMatchObject({ reclaimedBytes: 0 });
    expect(await queue.cleanup()).toMatchObject({ reclaimedBytes: 2 });
    expect(
      (await db.client.analysisReceipt.findUnique({ where: { id: 'z-eligible' } }))?.inputJson,
    ).toBeNull();
    expect(
      (await db.client.analysisReceipt.findUnique({ where: { id: 'blocked-00' } }))?.inputJson,
    ).toBe('{}');
  } finally {
    await db.cleanup();
  }
});

test.each([
  { kind: 'output-unparseable', recovery: 'scheduled' },
  { kind: 'output-empty', recovery: 'scheduled' },
  { kind: 'verify-format', recovery: 'scheduled' },
  { kind: 'timeout', recovery: 'scheduled' },
  { kind: 'output-truncated', recovery: 'exhausted' },
] as const)(
  '$kind 실패는 세션만 건너뛰고 큐를 멈추지 않는다 (복구: $recovery)',
  async ({ kind, recovery }) => {
    const db = await isolatedRepository();
    const previousTimeout = process.env.AI_CALL_TIMEOUT_MS;
    process.env.AI_CALL_TIMEOUT_MS = '50';
    const ai = fixtureAiAdapter({
      analyzeTranscript: async () => ({ summary: '결정 없음', decisions: [] }),
    });
    const extract = ai.extractGraph;
    const verify = ai.verifyGraph;
    const fails = (transcript: string) => transcript.includes('Redis');
    ai.extractGraph = (transcript, context) => {
      if (!fails(transcript) || kind === 'verify-format') return extract(transcript, context);
      // 타임아웃은 응답하지 않는 호출을 AI_CALL_TIMEOUT_MS가 끊어 만든다.
      if (kind === 'timeout')
        return new Promise((_, reject) =>
          context.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      return Promise.reject(new AppError('provider output failure', 422, { failureKind: kind }));
    };
    ai.verifyGraph = (transcript, graph, context) =>
      kind === 'verify-format' && fails(transcript)
        ? Promise.resolve({ value: { valid: 'yes' } })
        : verify(transcript, graph, context);
    const queue = new AnalysisQueueService(
      db.repo,
      new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
    );
    try {
      await queue.startScan({
        id: 'scan',
        guildId: 'guild',
        channelId: 'channel',
        upperMessageId: '200',
        afterMessageId: '0',
      });
      await queue.receive({
        input,
        scanId: 'scan',
        rangeIndex: 0,
        range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
      });
      await queue.receive({
        input: {
          ...input,
          requestId: 'receipt-2',
          rawMessages: [{ id: '200', author: 'Lee', content: 'PostgreSQL을 사용합니다.' }],
        },
        scanId: 'scan',
        rangeIndex: 1,
        range: { afterMessageId: '100', startMessageId: '200', endMessageId: '200' },
      });
      await queue.sealScan('scan', 2);
      await queue.runOnce();
      expect((await queue.results(['receipt-1']))[0]).toMatchObject({
        state: 'completed',
        result: { skippedSessions: [{ kind, messageIds: ['100'] }] },
      });
      // 큐 전체 일시 중단이 없으므로 다음 범위가 바로 진행된다.
      await queue.runOnce();
      expect((await queue.results(['receipt-2']))[0].state).toBe('completed');
      expect(await db.repo.getCheckpoint('channel')).toBe('200');
      const status = await new DiscussionService(
        db.repo,
        ai,
        new DecisionExtractorCore(),
      ).getStatus('receipt-1', 'guild');
      expect(status.sessions[0].recovery).toMatchObject({ state: recovery, failureKind: kind });
    } finally {
      if (previousTimeout === undefined) delete process.env.AI_CALL_TIMEOUT_MS;
      else process.env.AI_CALL_TIMEOUT_MS = previousTimeout;
      await db.cleanup();
    }
  },
);

test('스캔 밖 요청의 AI 타임아웃은 그 요청만 재시도하고 큐 전체를 멈추지 않는다', async () => {
  const db = await isolatedRepository();
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => ({ summary: '결정 없음', decisions: [] }),
  });
  const extract = ai.extractGraph;
  ai.extractGraph = (transcript, context) =>
    transcript.includes('Redis')
      ? Promise.reject(new AppError('AI call timeout', 503, { failureKind: 'timeout' }))
      : extract(transcript, context);
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
  );
  try {
    await queue.receive({ input });
    await queue.runOnce();
    expect((await queue.results([input.requestId]))[0]).toMatchObject({
      state: 'retry',
      attempts: 1,
    });
    expect(await queue.metrics()).toMatchObject({ pauseUntil: null, acceptingScans: true });
    await queue.receive({
      input: {
        ...input,
        requestId: 'other-channel',
        channelId: 'other',
        rawMessages: [{ id: '300', author: 'Kim', content: 'PostgreSQL을 사용합니다.' }],
      },
    });
    await queue.runOnce();
    expect((await queue.results(['other-channel']))[0].state).toBe('completed');
  } finally {
    await db.cleanup();
  }
});

const recoveryScenario = async (
  recoveryFailures: Array<'output-unparseable' | 'output-truncated' | 'lease-lost'>,
) => {
  const db = await isolatedRepository();
  let now = Date.now();
  const seeds: Array<number | undefined> = [];
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => ({ summary: '결정 없음', decisions: [] }),
  });
  ai.extractGraph = async (_transcript, context) => {
    seeds.push(context.settings.seed);
    const kind = seeds.length === 1 ? 'output-unparseable' : recoveryFailures[seeds.length - 2];
    throw new AppError('recovery failure', kind === 'lease-lost' ? 503 : 422, {
      failureKind: kind,
    });
  };
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
    {},
    () => now,
  );
  await queue.startScan({
    id: 'scan',
    guildId: 'guild',
    channelId: 'channel',
    upperMessageId: '100',
    afterMessageId: '0',
  });
  await queue.receive({
    input,
    scanId: 'scan',
    rangeIndex: 0,
    range: { afterMessageId: '0', startMessageId: '100', endMessageId: '100' },
  });
  await queue.sealScan('scan', 1);
  await queue.runOnce();
  const recovery = async () =>
    (
      await new DiscussionService(db.repo, ai, new DecisionExtractorCore()).getStatus(
        'receipt-1',
        'guild',
      )
    ).sessions[0].recovery;
  const advance = async (ms: number) => {
    now += ms;
    await queue.recoverOnce();
    return recovery();
  };
  return { db, seeds, advance };
};

test('자동 재시도는 시도마다 다른 seed로 다시 분석한다', async () => {
  const { db, seeds, advance } = await recoveryScenario([
    'output-unparseable',
    'output-unparseable',
  ]);
  try {
    expect(await advance(61_000)).toMatchObject({ state: 'scheduled', attempts: 1 });
    expect(await advance(301_000)).toMatchObject({ state: 'exhausted', attempts: 2 });
    // 최초 분석은 provider 기본 seed, 자동 재시도는 시도 번호마다 다른 seed를 쓴다.
    expect(seeds).toEqual([undefined, 43, 44]);
  } finally {
    await db.cleanup();
  }
});

test('자동 재시도에서 출력이 잘리면 더 재시도하지 않고 수동 재분석으로 넘긴다', async () => {
  const { db, seeds, advance } = await recoveryScenario(['output-truncated']);
  try {
    // 수동 재분석만 남은 사유가 동기화 상세에 보여야 한다.
    expect(await advance(61_000)).toMatchObject({
      state: 'exhausted',
      attempts: 1,
      failureKind: 'output-truncated',
    });
    expect(seeds).toHaveLength(2);
  } finally {
    await db.cleanup();
  }
});

test('소유권을 잃어 중단된 자동 재시도는 재시도 횟수에 넣지 않는다', async () => {
  const { db, advance } = await recoveryScenario(['lease-lost', 'output-unparseable']);
  try {
    expect(await advance(61_000)).toMatchObject({ state: 'scheduled', attempts: 0 });
  } finally {
    await db.cleanup();
  }
});

test('소유권을 잃은 분석은 시도로 세지 않고 큐 전체를 멈추지 않는다', async () => {
  const db = await isolatedRepository();
  const ai = fixtureAiAdapter({
    analyzeTranscript: async () => ({ summary: '결정 없음', decisions: [] }),
  });
  ai.extractGraph = async () => {
    throw new AppError('Analysis ownership lost', 503, { failureKind: 'lease-lost' });
  };
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
  );
  try {
    await queue.receive({ input });
    await queue.runOnce();
    expect((await queue.results([input.requestId]))[0]).toMatchObject({
      state: 'retry',
      attempts: 0,
    });
    expect(await queue.metrics()).toMatchObject({ pauseUntil: null });
  } finally {
    await db.cleanup();
  }
});
