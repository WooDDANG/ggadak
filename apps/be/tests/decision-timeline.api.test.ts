import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import { DecisionSchema } from '@ggaddak/shared';

test('authenticated guild members read confirmed timeline groups through the v1 API', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    for (const [id, guildId, state, confirmedDate] of [
      ['confirmed', 'guild-1', 'Decided', '2026-02-01T02:00:00.000Z'],
      ['undated', 'guild-1', 'Decided', null],
      ['candidate', 'guild-1', 'Draft', '2026-02-01T03:00:00.000Z'],
      ['superseded', 'guild-1', 'Superseded', '2026-02-01T04:00:00.000Z'],
      ['other-guild', 'guild-2', 'Decided', '2026-02-01T03:00:00.000Z'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          topic: 'Storage',
          decision: 'Use SQLite',
          rationale: 'Durable',
          state,
          decisionConfirmedDate: confirmedDate,
          source: { guildId, channelId: 'channel', triggerMessageId: 'message' },
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(
      `${base}/api/v1/decisions/timeline?guildId=guild-1&groupBy=month&timezone=Asia%2FSeoul`,
      { headers },
    );
    expect(response.status).toBe(200);
    const result = ((await response.json()) as any).data;
    expect(result.groupBy).toBe('month');
    expect(result.timezone).toBe('Asia/Seoul');
    expect(result.totalElements).toBe(1);
    expect(result.groups[0].key).toBe('2026-02');
    expect(result.groups[0].items.map((item: any) => item.id)).toEqual(['confirmed']);
    expect(
      (await fetch(`${base}/api/v1/decisions/timeline?guildId=missing`, { headers })).status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/api/v1/decisions/timeline?guildId=guild-1&groupBy=year`, { headers }))
        .status,
    ).toBe(400);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
