import { expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { AiCallScheduler } from '../src/services/ai-call-scheduler.js';

test('two BE clients share the AI-call cap and a cancelled waiter does not leak a permit', async () => {
  const db = await isolatedRepository();
  const second = new PrismaClient({ datasources: { db: { url: db.url } } });
  try {
    const a = new AiCallScheduler(db.client, 2);
    const b = new AiCallScheduler(second, 2);
    let active = 0,
      peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const lease = await (index % 2 ? a : b).acquire(new AbortController().signal);
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise(resolve => setTimeout(resolve, 30));
        } finally {
          active--;
          await lease.release();
        }
      }),
    );
    expect(peak).toBe(2);
    const leases = await Promise.all([
      a.acquire(new AbortController().signal),
      b.acquire(new AbortController().signal),
    ]);
    const controller = new AbortController();
    const waiting = a.acquire(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow(/cancel/i);
    await Promise.all(leases.map(lease => lease.release()));
    expect(await db.client.aiCallLease.count()).toBe(0);
  } finally {
    await second.$disconnect();
    await db.cleanup();
  }
});
