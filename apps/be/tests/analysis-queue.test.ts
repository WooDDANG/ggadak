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

test('BE permits channel B transfer while channel A is queued and completes the job after analysis', async () => {
  const db = await isolatedRepository();
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(
      db.repo,
      fixtureAiAdapter({ analyzeTranscript: async () => ({ summary: 'none', decisions: [] }) }),
      new DecisionExtractorCore(),
    ),
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
      status: 'COMPLETED',
      completedChannels: 2,
    });
  } finally {
    await db.cleanup();
  }
});

test('exhausted channel transfer closes the job and an explicit resume preserves its identity',async()=>{
  const db=await isolatedRepository();const jobs=new SyncJobService(db.repo);
  try{
    await db.client.guild.create({data:{id:'guild',name:'Guild',channels:{create:{id:'channel',name:'A'}}}});
    const job=await jobs.create('guild',true),claim=(await jobs.claim(true))!;
    await jobs.update(job.jobId,{owner:claim.owner,channelResult:{channelId:'channel',status:'FAILED',messagesScanned:0,decisionsFound:0,errorMessage:'capacity'},release:true});
    expect(await jobs.get(job.jobId,'guild')).toMatchObject({status:'FAILED'});
    expect(await jobs.resume(job.jobId,'guild','channel')).toMatchObject({jobId:job.jobId,status:'QUEUED'});
    const resumed=(await jobs.claim(true))!;expect(resumed.jobId).toBe(job.jobId);expect(resumed.channelIds).toEqual(['channel']);expect(resumed.owner).not.toBe(claim.owner);
    await expect(jobs.update(job.jobId,{owner:claim.owner})).rejects.toThrow(/lease/);
  }finally{await db.cleanup();}
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
