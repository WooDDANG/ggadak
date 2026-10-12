import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from './test-support/auth.js';
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
    assert.equal(response.status, 200);
    const data = ((await response.json()) as any).data;
    assert.deepEqual(data.pageInfo, {
      currentPage: 2,
      pageSize: 1,
      totalElements: 2,
      totalPages: 2,
    });
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].status, 'CONFIRMED');
    assert.equal(data.items[0].confirmedDate, null);
    assert.equal(data.items[0].category, '기술');
    assert.equal(data.items[0].source.channelName, 'Architecture');
    const detail = (
      (await (
        await fetch(`${base}/api/v1/decisions/old?guildId=guild-1`, { headers })
      ).json()) as any
    ).data;
    assert.equal(detail.status, 'SUPERSEDED');
    assert.equal(detail.supersededById, 'one');
    assert.equal(detail.alternatives[0].name, 'Email');
    assert.ok(detail.alternatives[0].id);
    assert.equal(detail.dates.confirmedDate, null);
    assert.deepEqual(detail.rawEvidence, ['m']);
    assert.equal(detail.actionItems[0].state, 'completed');
    assert.equal(
      (await fetch(`${base}/api/v1/decisions/other?guildId=guild-1`, { headers })).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/api/v1/decisions?guildId=guild-1&page=0`, { headers })).status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/v1/decisions?guildId=guild-1&status=bogus`, { headers })).status,
      400,
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
