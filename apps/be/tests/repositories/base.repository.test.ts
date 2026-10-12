import 'reflect-metadata';
import { test, expect } from 'vitest';
import { isolatedRepository } from '../../src/repositories/test-database.js';

test('repository operations reuse an outer transaction and commit together', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.withTransaction(async tx => {
      await db.repo.saveCheckpoint('first', '1', tx);
      await db.repo.withTransaction(async nested => {
        expect(nested).toBe(tx);
        await db.repo.saveCheckpoint('second', '2', nested);
        expect(await db.repo.getCheckpoint('first', nested)).toBe('1');
      }, tx);
    });
    expect(await db.repo.getCheckpoint('second')).toBe('2');
  } finally {
    await db.cleanup();
  }
});

test('a failed outer transaction rolls back every repository operation', async () => {
  const db = await isolatedRepository();
  try {
    await expect(
      db.repo.withTransaction(async tx => {
        await db.repo.saveCheckpoint('rolled-back', '1', tx);
        await db.repo.withTransaction(async nested => {
          await db.repo.saveCheckpoint('also-rolled-back', '2', nested);
        }, tx);
        throw new Error('abort transaction');
      }),
    ).rejects.toThrow('abort transaction');
    expect(await db.repo.getCheckpoint('rolled-back')).toBeNull();
    expect(await db.repo.getCheckpoint('also-rolled-back')).toBeNull();
  } finally {
    await db.cleanup();
  }
});

import { BaseRepository } from '../../src/repositories/base.repository.js';
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../src/errors/AppError.js';

// A persistence adapter exercises the base class against real Prisma failures.
class GuildRepository extends BaseRepository {
  create(id: string) {
    return this.withPrismaErrors(() => this.prisma.guild.create({ data: { id, name: 'Team' } }));
  }
  rename(id: string, requiresExisting = false) {
    return this.withPrismaErrors(
      () => this.prisma.guild.update({ where: { id }, data: { name: 'Renamed' } }),
      requiresExisting,
    );
  }
}

test('unique conflicts map to 409 and missing writes map to 404 only when explicitly required', async () => {
  const db = await isolatedRepository();
  const guilds = new GuildRepository(db.client);
  try {
    await guilds.create('team');
    await expect(guilds.create('team')).rejects.toBeInstanceOf(ConflictError);
    await expect(guilds.rename('missing')).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(guilds.rename('missing', true)).rejects.toBeInstanceOf(NotFoundError);
  } finally {
    await db.cleanup();
  }
});
