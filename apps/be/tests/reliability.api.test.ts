import { fixtureAiAdapter } from '../src/test-support/ai-fixture.js';
import { test, expect } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { createServer } from '../src/server.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';

test('Web history preserves a rejected candidate after manual reanalysis; checkpoint control is authenticated and monotonic', async () => {
  const db = await isolatedRepository();
  const server = await createServer(
    db.repo,
    fixtureAiAdapter({
      analyzeTranscript: async () => ({
        found: true,
        summary: 'candidate',
        decisions: [
          {
            topic: 'Storage',
            decision: 'Use SQLite',
            rationale: 'Simple deployment',
            rationaleQuotes: [],
            categoryTag: '기술',
            actionItems: [],
            alternatives: [],
            isPivot: false,
          },
        ],
      }),
    }),
    { ...fakeAuthOptions(), serviceToken: 'service' },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const send = (url: string, body: unknown, token: string) =>
    fetch(`${base}${url}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const evidence = {
    guildId: 'guild-1',
    channelId: 'channel',
    triggerMessageId: '101',
    rawMessages: [
      {
        id: '101',
        author: 'Lee',
        content: 'SQLite를 채택합시다',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
  try {
    const first = await send(
      '/api/discussions/analyze',
      { ...evidence, requestId: 'first' },
      'service',
    );
    expect(first.status).toBe(200);
    const candidate = ((await first.json()) as any).decisions[0];
    expect(await db.repo.getCheckpoint('channel')).toBeNull();
    const { token } = await loginAsTestUser(base);
    expect(
      (
        await send(
          `/api/v1/review-queue/${candidate.id}/review?guildId=guild-1`,
          { action: 'reject', expectedVersion: candidate.version },
          token,
        )
      ).status,
    ).toBe(200);
    const manual = await send(
      '/api/discussions/analyze',
      { ...evidence, requestId: 'manual', isManualOverride: true },
      'service',
    );
    expect(manual.status).toBe(200);
    const reused = ((await manual.json()) as any).decisions[0];
    expect(reused.id).toBe(candidate.id);
    expect(reused.state).toBe('Rejected');
    const history = await fetch(
      `${base}/api/v1/decisions/${candidate.id}/history?guildId=guild-1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(history.status).toBe(200);
    const records = ((await history.json()) as any).data;
    expect(records).toHaveLength(2);
    expect(records.find((r: any) => r.isManualOverride).previousRequestIds).toContain('first');
    expect(
      (
        await fetch(`${base}/api/v1/decisions/${candidate.id}/history?guildId=guild-2`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          '/api/channels/channel/checkpoint',
          { lastMessageId: '1400000000000000007' },
          token,
        )
      ).status,
    ).toBe(401);
    expect(
      (await send('/api/channels/channel/checkpoint', { lastMessageId: 'invalid' }, 'service'))
        .status,
    ).toBe(400);
    expect(
      (
        await send(
          '/api/channels/channel/checkpoint',
          { lastMessageId: '1400000000000000007' },
          'service',
        )
      ).status,
    ).toBe(200);
    const old = await send(
      '/api/channels/channel/checkpoint',
      { lastMessageId: '1400000000000000006' },
      'service',
    );
    expect(old.status).toBe(200);
    expect(((await old.json()) as any).lastMessageId).toBe('1400000000000000007');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
