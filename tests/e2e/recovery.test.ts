import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../apps/be/src/server.js';
import { isolatedRepository } from '../../apps/be/src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../../apps/be/src/test-support/auth.js';
import { BackendApiService } from '../../apps/bot/src/services/backend-api.service.js';

test('a restarted Bot claims an idempotent Web retry, persists no-decision completion and recovers its scan checkpoint through production HTTP', async () => {
  const db = await isolatedRepository();
  const directory = await mkdtemp(join(tmpdir(), 'ggaddak-egress-e2e-'));
  let aiCalls = 0;
  const server = await createServer(
    db.repo,
    {
      analyzeTranscript: async () => {
        aiCalls++;
        return { found: false, summary: 'No decision', decisions: [] };
      },
    },
    { ...fakeAuthOptions(), serviceToken: 'service' },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const payload = {
    requestId: 'retained',
    guildId: 'guild-1',
    channelId: 'channel',
    triggerMessageId: '200',
    rawMessages: [
      {
        id: '101',
        author: 'Lee',
        content: 'We have decided to adopt PostgreSQL as our primary database',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '200',
        author: 'Lee',
        content: 'The migration plan covers this discussion.',
        createdAt: '2026-01-01T00:00:30Z',
      },
    ],
  };
  try {
    await db.repo.saveCheckpoint('channel', '100');
    const offline = new BackendApiService(
      base,
      directory,
      async () => new Response('', { status: 503 }),
      undefined,
      'service',
      { maxAttempts: 1, initialDelayMs: 5, maxDelayMs: 50, timeoutMs: 1000, jitter: 0 },
    );
    await expect(
      offline.analyzeDiscussion(payload, undefined, {
        afterMessageId: '100',
        startMessageId: '101',
        endMessageId: '200',
      }),
    ).rejects.toMatchObject({ outcome: 'retained-failure' });
    const restarted = new BackendApiService(base, directory, fetch, undefined, 'service');
    await restarted.synchronizeDeliveryStatus();
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const queue = async () =>
      (
        (await (
          await fetch(`${base}/api/v1/analysis-deliveries?guildId=guild-1`, { headers })
        ).json()) as any
      ).data;
    expect((await queue()).requests[0].status).toBe('retained-failure');
    const retry = async () =>
      fetch(`${base}/api/v1/analysis-deliveries/retained/retry?guildId=guild-1`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ commandId: 'web-retry' }),
      });
    expect((await retry()).status).toBe(202);
    expect((await retry()).status).toBe(202);
    await restarted.synchronizeDeliveryStatus();
    let acknowledgement: any;
    for (let i = 0; i < 100; i++) {
      acknowledgement = ((await (await retry()).json()) as any).data;
      if (acknowledgement.acknowledgedAt) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(acknowledgement.acknowledgedAt).toBeTruthy();
    await restarted.synchronizeDeliveryStatus();
    expect((await queue()).requests[0].status).toBe('completed-no-decision');
    await restarted.recoverScanCheckpoints();
    expect(await db.repo.getCheckpoint('channel')).toBe('200');
    const replayed = await new BackendApiService(
      base,
      directory,
      fetch,
      undefined,
      'service',
    ).analyzeDiscussion(payload);
    expect(replayed.found).toBe(false);
    expect(aiCalls).toBe(1);
    expect(await db.client.decision.count()).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});
