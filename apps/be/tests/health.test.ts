import { afterEach, expect, test } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions } from '../src/test-support/auth.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test('readiness requires fresh bot and Gateway observations while liveness stays available', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = Date.now();
  const server = await createServer(
    db.repo,
    undefined,
    fakeAuthOptions(undefined, () => now),
  );
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  expect((await fetch(`${base}/status`)).status).toBe(200);
  const starting = await fetch(`${base}/api/health`);
  expect(starting.status).toBe(503);
  expect((await starting.json()).checks).toMatchObject({
    database: true,
    bot: false,
    discord: false,
  });
  await db.repo.prisma.analysisDeliveryHeartbeat.create({
    data: { id: 'bot', synchronizedAt: new Date(now) },
  });
  await db.repo.prisma.guildAccessControl.update({
    where: { id: 'discord' },
    data: {
      streamId: 'test',
      connected: true,
      leaseUntil: new Date(now + 35000),
      membersIntent: false,
    },
  });
  const ready = await fetch(`${base}/health`);
  expect(ready.status).toBe(200);
  expect(ready.headers.get('cache-control')).toBe('no-store');
  expect(await ready.json()).toMatchObject({
    ready: true,
    checks: { bot: true, discord: true, membersIntent: false },
  });
  now += 36000;
  const expired = await fetch(`${base}/health`);
  expect(expired.status).toBe(503);
  expect(await expired.json()).toMatchObject({
    ready: false,
    checks: { bot: false, discord: false },
  });
  expect((await fetch(`${base}/status`)).status).toBe(200);
});
