import { expect, test } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Events } from 'discord.js';
import { createServer } from '../../apps/be/src/server.js';
import { isolatedRepository } from '../../apps/be/src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../../apps/be/src/test-support/auth.js';
import { GuildAccessPublisher } from '../../apps/bot/src/services/guild-access-publisher.js';
import { registerGuildAccessEvents } from '../../apps/bot/src/events/guild-access.events.js';
import { BackendApiService } from '../../apps/bot/src/services/backend-api.service.js';

test('Discord removal crosses the Bot journal and authenticated HTTP API to revoke every existing web session', async () => {
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, {
    ...fakeAuthOptions(),
    serviceToken: 'integration-service',
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const publisher = new GuildAccessPublisher({
    backendUrl: base,
    directory: join(db.dir, 'events'),
    token: 'integration-service',
  });
  const client = Object.assign(new EventEmitter(), {
    guilds: {
      cache: new Map([
        ['guild-1', { id: 'guild-1', available: true }],
        ['guild-2', { id: 'guild-2', available: true }],
      ]),
    },
  });
  try {
    registerGuildAccessEvents(
      client as unknown as Parameters<typeof registerGuildAccessEvents>[0],
      publisher,
      true,
    );
    client.emit(Events.ClientReady);
    await publisher.flush();
    const first = await loginAsTestUser(base);
    const second = await loginAsTestUser(base);
    expect(
      (
        await fetch(`${base}/api/v1/decisions?guildId=guild-1`, {
          headers: { Authorization: `Bearer ${first.token}` },
        })
      ).status,
    ).toBe(200);
    client.emit(Events.Raw, {
      op: 0,
      t: 'GUILD_MEMBER_REMOVE',
      s: 1,
      d: { guild_id: 'guild-1', user: { id: 'user-1' } },
    });
    await publisher.flush();
    for (const token of [first.token, second.token]) {
      const headers = { Authorization: `Bearer ${token}` };
      expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(
        403,
      );
      expect((await fetch(`${base}/api/v1/decisions?guildId=guild-2`, { headers })).status).toBe(
        200,
      );
    }
    const bot = new BackendApiService(
      base,
      join(db.dir, 'analysis'),
      fetch,
      Date.now,
      'integration-service',
    );
    expect(
      await bot.saveFeedback({
        id: 'authenticated-feedback',
        source: '교수',
        content: 'Keep service feedback private',
        channelId: 'channel-1',
        createdAt: new Date().toISOString(),
      }),
    ).toBe(true);
    expect((await fetch(`${base}/api/feedbacks`)).status).toBe(401);
    const feedback = await fetch(`${base}/api/feedbacks`, {
      headers: { Authorization: 'Bearer integration-service' },
    });
    expect((await feedback.json()).feedbacks.map((item: { id: string }) => item.id)).toEqual([
      'authenticated-feedback',
    ]);
  } finally {
    publisher.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
