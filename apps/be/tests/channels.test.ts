import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from '../src/repositories/decision.repository.js';
import { AppError } from '../src/errors/AppError.js';
import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';

test('Monitoring settings authorize guild managers, validate Discord channels, and survive restart', async () => {
  const db = await isolatedRepository();
  let accessible = true;
  let botInstalled = true;
  let reopened: PrismaClient | undefined;
  const options = {
    ...fakeAuthOptions(),
    serviceToken: 'test-service-token',
    channelAdapter: {
      list: async (guildId: string) => {
        if (!botInstalled) throw new AppError('Bot is not installed in this server', 409);
        return [{ id: 'c1', guildId, name: 'decisions', type: 0, accessible }];
      },
    },
  };
  let server = await createServer(db.repo, undefined, options);
  const listen = async () => {
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(server.address() as any).port}`;
  };
  let base = await listen();
  try {
    const deniedOrigin = await fetch(`${base}/health`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    expect(deniedOrigin.headers.get('access-control-allow-origin')).toBe(null);
    const localOrigin = await fetch(`${base}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(localOrigin.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const save = async (guildId: string, ids: string[]) =>
      fetch(`${base}/api/v1/discord/channels?guildId=${guildId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ channelIds: ids }),
      });
    expect((await save('guild-1', ['c1'])).status).toBe(200);
    expect((await save('guild-2', ['c1'])).status).toBe(403);
    expect((await save('guild-1', ['other-server-channel'])).status).toBe(400);
    const get = async () =>
      (
        (await (
          await fetch(`${base}/api/v1/discord/channels?guildId=guild-1`, { headers })
        ).json()) as any
      ).data;
    expect((await get()).monitoredChannelIds).toEqual(['c1']);
    await new Promise<void>(r => server.close(() => r()));
    await db.client.$disconnect();
    reopened = new PrismaClient({ datasources: { db: { url: db.url } } });
    server = await createServer(new DecisionRepository(reopened), undefined, options);
    base = await listen();
    expect((await get()).monitoredChannelIds).toEqual(['c1']);
    expect((await fetch(`${base}/api/v1/internal/monitoring?guildId=guild-1`)).status).toBe(401);
    const monitored = async () =>
      (
        (await (
          await fetch(`${base}/api/v1/internal/monitoring?guildId=guild-1`, {
            headers: { Authorization: 'Bearer test-service-token' },
          })
        ).json()) as any
      ).data.channelIds;
    expect(await monitored()).toEqual(['c1']);
    accessible = false;
    expect(await monitored()).toEqual([]);
    expect((await save('guild-1', ['c1'])).status).toBe(400);
    expect((await get()).monitoredChannelIds).toEqual(['c1']);
    botInstalled = false;
    expect((await save('guild-1', [])).status).toBe(409);
    botInstalled = true;
    accessible = true;
    expect((await get()).monitoredChannelIds).toEqual(['c1']);
    expect((await save('guild-1', ['c1', 'c1'])).status).toBe(400);
    expect((await save('guild-1', [])).status).toBe(200);
    expect(await monitored()).toEqual([]);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await reopened?.$disconnect();
    await db.cleanup();
  }
});
