import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import { DecisionSchema } from '@ggaddak/shared';

test('server members browse filtered paginated Decision Cards and complete detail with preserved history', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions());
  await new Promise<void>(resolve => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as any).port}`;
  try {
    for (const [id, category, state, guildId] of [
      ['old', '기술', 'Superseded', 'guild-1'],
      ['one', '기술', 'Decided', 'guild-1'],
      ['two', '기술', 'Decided', 'guild-1'],
      ['other', '기술', 'Decided', 'guild-2'],
      ['candidate', '기타', 'Draft', 'guild-1'],
    ])
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id,
          categoryTag: category,
          state,
          topic: 'Auth',
          title: `Summary ${id}`,
          decision: 'Use Discord',
          rationale: 'Server identity',
          alternatives: [{ option: 'Email', reason: 'Account mapping' }],
          supersededById: id === 'old' ? 'one' : null,
          supersedesId: id === 'one' ? 'old' : null,
          source: {
            guildId,
            channelId: 'c',
            channelName: 'Architecture',
            triggerMessageId: 'm',
            participants: ['Lee'],
            messageUrl: `https://discord.com/channels/${guildId}/c/m`,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          rawEvidence: ['m'],
          actionItems: [{ id: 'task', task: 'Migrate', state: 'completed' }],
        }),
      );
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(
      `${base}/api/v1/decisions?guildId=guild-1&status=CONFIRMED&category=기술&page=2&size=1`,
      { headers },
    );
    expect(response.status).toBe(200);
    const data = ((await response.json()) as any).data;
    expect(data.pageInfo).toEqual({
      currentPage: 2,
      pageSize: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(data.items.length).toBe(1);
    expect(data.items[0].status).toBe('CONFIRMED');
    expect(data.items[0].confirmedDate).toBe(null);
    expect(data.items[0].category).toBe('기술');
    expect(data.items[0].source.channelName).toBe('Architecture');
    const detail = (
      (await (
        await fetch(`${base}/api/v1/decisions/old?guildId=guild-1`, { headers })
      ).json()) as any
    ).data;
    expect(detail.status).toBe('SUPERSEDED');
    expect(detail.supersededById).toBe('one');
    expect(detail.alternatives[0].name).toBe('Email');
    expect(detail.alternatives[0].id).toBeTruthy();
    expect(detail.dates.confirmedDate).toBe(null);
    expect(detail.rawEvidence).toEqual(['m']);
    expect(detail.actionItems[0].state).toBe('completed');
    expect(
      (await fetch(`${base}/api/v1/decisions/other?guildId=guild-1`, { headers })).status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/api/v1/decisions?guildId=guild-1&page=0`, { headers })).status,
    ).toBe(400);
    expect(
      (await fetch(`${base}/api/v1/decisions?guildId=guild-1&status=bogus`, { headers })).status,
    ).toBe(400);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
