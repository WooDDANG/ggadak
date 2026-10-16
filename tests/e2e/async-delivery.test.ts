import { test, expect } from 'vitest';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../apps/be/src/server.js';
import { isolatedRepository } from '../../apps/be/src/repositories/test-database.js';
import { fixtureAiAdapter } from '../../apps/be/src/test-support/ai-fixture.js';
import { BackendApiService } from '../../apps/bot/src/services/backend-api.service.js';
import { ChannelTransfer } from '../../apps/bot/src/services/channel-transfer.js';

test('real Bot HTTP receipts pipeline channel data while slow AI runs; results are independently recoverable', async () => {
  const db = await isolatedRepository(),
    dir = await mkdtemp(join(tmpdir(), 'pipeline-'));
  let release!: () => void,
    started = false,
    feedback = 0;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const app = await createApp(
    db.repo,
    fixtureAiAdapter({
      analyzeTranscript: async () => {
        started = true;
        await gate;
        return { summary: 'No candidates', decisions: [] };
      },
    }),
    { serviceToken: 'service' },
  );
  const server = http.createServer(app);
  let work: Promise<void> | undefined;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const backend = new BackendApiService(
    base,
    dir,
    fetch,
    undefined,
    'service',
    undefined,
    undefined,
    true,
  );
  backend.observeDeliveries(async () => {
    feedback++;
  });
  const messages = Array.from({ length: 205 }, (_, i) => ({
    id: String(i + 1),
    content: 'Redis를 사용하기로 결정했습니다. 응답 속도를 개선하기 위한 결정입니다.',
    author: { username: 'Lee', bot: false },
    createdAt: new Date('2026-01-01'),
    reactions: { cache: new Map() },
  }));
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
    const t = performance.now();
    expect(
      await new ChannelTransfer(backend).run(channel, { full: true, requestId: 'scan' }),
    ).toMatchObject({ scannedCount: 205, pendingAnalysis: true });
    const transferMs = performance.now() - t;
    expect(started).toBe(false);
    work = app.locals.analysisQueue.runOnce();
    for (let i = 0; i < 200 && !started; i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(started).toBe(true);
    const receiptAt = performance.now();
    expect(
      await backend.analyzeDiscussion({
        requestId: 'live',
        guildId: 'guild',
        channelId: 'live-channel',
        rawMessages: [
          { id: '999', author: 'Kim', content: '배포 환경은 Docker로 통일하기로 결정했습니다.' },
        ],
      }),
    ).toMatchObject({ accepted: true });
    expect(feedback).toBe(0);
    const receiptMs = performance.now() - receiptAt;
    release();
    await work;
    for (let i = 0; i < 5; i++) await app.locals.analysisQueue.runOnce();
    await backend.reconcileResults();
    await backend.reconcileResults();
    expect(feedback).toBe(1);
    expect(await db.repo.getCheckpoint('channel')).toBe('205');
    expect(await app.locals.analysisQueue.metrics()).toMatchObject({ pending: 0 });
    console.info(
      JSON.stringify({
        fixtureMessages: 205,
        transferMs: Math.round(transferMs),
        receiptWhileAiBlockedMs: Math.round(receiptMs),
        duplicateFeedback: 0,
      }),
    );
  } finally {
    release();
    await work;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
    await rm(dir, { recursive: true, force: true });
  }
});
