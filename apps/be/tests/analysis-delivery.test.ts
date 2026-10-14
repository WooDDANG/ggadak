import { fixtureAiAdapter } from '../src/test-support/ai-fixture.js';
import 'reflect-metadata';
import { test, expect } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import {
  AnalysisDeliveryService,
  AnalysisDeliveryStatus,
} from '../src/services/analysis-delivery.service.js';

const request: AnalysisDeliveryStatus = {
  requestId: 'request',
  guildId: 'guild',
  channelId: 'channel',
  status: 'retained-failure',
  attempts: 5,
  nextAttemptAt: 0,
  errorCategory: 'backend-unavailable',
};

test('queue snapshots and retry acknowledgements persist; duplicate Web commands are idempotent', async () => {
  const db = await isolatedRepository();
  try {
    const service = new AnalysisDeliveryService(db.repo);
    expect((await service.list('guild')).available).toBe(false);
    await service.synchronize([]);
    expect((await service.list('guild')).available).toBe(true);
    await service.synchronize([request]);
    expect((await service.list('guild')).available).toBe(true);
    const command = await service.retry('guild', 'request', 'command');
    expect((await service.retry('guild', 'request', 'coalesced-command')).id).toBe(command.id);
    expect(
      (await new AnalysisDeliveryService(db.repo).retry('guild', 'request', 'command')).id,
    ).toBe(command.id);
    expect((await service.synchronize([request])).map(c => c.id)).toEqual(['command']);
    await service.acknowledge('command');
    await service.acknowledge('command');
    expect(await service.synchronize([request])).toEqual([]);
    expect((await service.list('other-guild')).requests).toEqual([]);
    await expect(service.retry('other-guild', 'request', 'command')).rejects.toThrow(
      /already used/,
    );
    await db.client.analysisDelivery.update({
      where: { requestId: 'request' },
      data: { synchronizedAt: new Date(0) },
    });
    expect((await service.list('guild')).available).toBe(false);
    await expect(service.retry('guild', 'request', 'new-command')).rejects.toThrow(/unavailable/);
  } finally {
    await db.cleanup();
  }
});

test('invalid or changed request scope rolls back the snapshot and completed work cannot be retried', async () => {
  const db = await isolatedRepository();
  try {
    const service = new AnalysisDeliveryService(db.repo);
    await service.synchronize([request]);
    await expect(
      service.synchronize([
        { ...request, requestId: 'new' },
        { ...request, guildId: 'other' },
      ]),
    ).rejects.toThrow(/scope/);
    expect(await db.client.analysisDelivery.count()).toBe(1);
    await service.synchronize([{ ...request, status: 'completed-no-decision' }]);
    await expect(service.retry('guild', 'request', 'command')).rejects.toThrow(/Only retained/);
  } finally {
    await db.cleanup();
  }
});

test('HTTP queue control enforces service auth, guild access, input validation and persisted retry status', async () => {
  const { createServer } = await import('../src/server.js');
  const { fakeAuthOptions, loginAsTestUser } = await import('../src/test-support/auth.js');
  const db = await isolatedRepository();
  const server = await createServer(
    db.repo,
    fixtureAiAdapter({
      analyzeTranscript: async () => ({ found: false, summary: '', decisions: [] }),
    }),
    { ...fakeAuthOptions(), serviceToken: 'service' },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const sync = `${base}/api/v1/internal/analysis-deliveries/sync`;
    const send = (url: string, body: unknown, token?: string) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    expect((await send(sync, { requests: [] })).status).toBe(401);
    expect(
      (await send(sync, { requests: [{ ...request, status: 'invalid' }] }, 'service')).status,
    ).toBe(400);
    expect(
      (await send(sync, { requests: [{ ...request, guildId: 'guild-1' }] }, 'service')).status,
    ).toBe(200);
    const { token } = await loginAsTestUser(base);
    const list = await fetch(`${base}/api/v1/analysis-deliveries?guildId=guild-1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    expect(((await list.json()) as any).data.available).toBe(true);
    expect(
      (
        await send(
          `${base}/api/v1/analysis-deliveries/request/retry?guildId=guild-2`,
          { commandId: 'command' },
          token,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          `${base}/api/v1/analysis-deliveries/request/retry?guildId=guild-1`,
          { commandId: 'command' },
          token,
        )
      ).status,
    ).toBe(202);
    const response = await send(
      sync,
      { requests: [{ ...request, guildId: 'guild-1' }] },
      'service',
    );
    expect(((await response.json()) as any).data[0].id).toBe('command');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
