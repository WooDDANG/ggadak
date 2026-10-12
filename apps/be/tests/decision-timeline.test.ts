import 'reflect-metadata';
import { test, expect } from 'vitest';
import { DecisionSchema } from '@ggaddak/shared';
import { isolatedRepository } from '../src/repositories/test-database.js';

test('confirmed timeline groups by requested month and timezone, excludes missing dates, and applies a guild date range', async () => {
  const db = await isolatedRepository();
  try {
    const save = async (id: string, guildId: string, confirmedDate: string | null) => {
      const decision = DecisionSchema.parse({
        id,
        topic: 'Storage',
        decision: 'Use SQLite',
        rationale: 'Durable',
        state: 'Decided',
        decisionConfirmedDate: confirmedDate,
        source: { guildId, channelId: `channel-${id}`, triggerMessageId: '1' },
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      await db.repo.saveDecision(decision);
    };
    await save('jan-local', 'guild-a', '2024-02-01T02:00:00.000Z');
    await save('feb-local', 'guild-a', '2024-02-01T03:00:00.000Z');
    await save('undated', 'guild-a', null);
    await save('other-guild', 'guild-b', '2024-02-01T03:00:00.000Z');

    const timeline = await db.repo.getConfirmedTimeline({
      guildId: 'guild-a',
      groupBy: 'month',
      timezone: 'America/Los_Angeles',
      from: '2024-02-01T00:00:00.000Z',
      to: '2024-02-02T00:00:00.000Z',
    });
    expect(timeline.totalElements).toBe(2);
    expect(
      timeline.groups.map(group => [group.key, group.count, group.items.map(item => item.id)]),
    ).toEqual([['2024-01', 2, ['feb-local', 'jan-local']]]);
    const empty = await db.repo.getConfirmedTimeline({
      guildId: 'guild-a',
      groupBy: 'month',
      timezone: 'UTC',
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-02-01T00:00:00.000Z',
    });
    expect({ totalElements: empty.totalElements, groups: empty.groups }).toEqual({
      totalElements: 0,
      groups: [],
    });
  } finally {
    await db.cleanup();
  }
});

test('timeline rejects unsupported grouping and invalid timezone', async () => {
  const db = await isolatedRepository();
  try {
    await expect(
      db.repo.getConfirmedTimeline({ guildId: 'g', groupBy: 'year' as never, timezone: 'UTC' }),
    ).rejects.toThrow(/groupBy/i);
    await expect(
      db.repo.getConfirmedTimeline({ guildId: 'g', groupBy: 'month', timezone: 'Mars/Olympus' }),
    ).rejects.toThrow(/timezone/i);
    await expect(
      db.repo.getConfirmedTimeline({
        guildId: 'g',
        groupBy: 'month',
        timezone: 'UTC',
        from: '2026-02-01',
      }),
    ).rejects.toThrow(/ISO 8601/i);
  } finally {
    await db.cleanup();
  }
});
