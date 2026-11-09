import { expect, test } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { GuildAccessRepository } from '../src/repositories/guild-access.repository.js';
import { GuildAccessService } from '../src/services/guild-access.service.js';
import { PrismaClient } from '@prisma/client';
import { sqliteConnectionUrl } from '../src/loaders/prisma.js';

test('bot heartbeat transactions do not block authentication session writes', async () => {
  const db = await isolatedRepository();
  const client = new PrismaClient({ datasources: { db: { url: sqliteConnectionUrl(db.url) } } });
  try {
    const accessRepo = new GuildAccessRepository(client);
    const access = new GuildAccessService(accessRepo);
    await access.initialize();
    await access.observe({
      kind: 'reset',
      streamId: 'probe',
      sequence: 0,
      guildIds: [],
      connected: true,
      membersIntent: true,
    });
    await client.user.create({ data: { id: 'probe', username: 'probe' } });
    await client.authSession.create({
      data: {
        id: 'probe',
        userId: 'probe',
        refreshToken: 'fixture',
        refreshedAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    let started!: () => void;
    let release!: () => void;
    const reading = new Promise<void>(resolve => {
      started = resolve;
    });
    const resume = new Promise<void>(resolve => {
      release = resolve;
    });
    const control = accessRepo.control.bind(accessRepo);
    accessRepo.control = (async (tx?: Parameters<typeof control>[0]) => {
      const result = await control(tx);
      started();
      await resume;
      return result;
    }) as unknown as typeof accessRepo.control;
    const heartbeat = access.observe({
      kind: 'heartbeat',
      streamId: 'probe',
      sequence: 0,
      connected: true,
    });
    await reading;
    const sessionWrite = client.authSession
      .updateMany({ where: { id: 'probe' }, data: { refreshOwner: 'owner' } })
      .then(value => value);
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    const results = await Promise.allSettled([heartbeat, sessionWrite]);
    const failures = results.filter(result => result.status === 'rejected');
    expect(failures).toEqual([]);
  } finally {
    await client.$disconnect();
    await db.cleanup();
  }
}, 30000);
