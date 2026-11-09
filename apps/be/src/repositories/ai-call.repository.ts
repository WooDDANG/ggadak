import type { PrismaClient } from '@prisma/client';
import { AnalysisPolicy } from '@ggaddak/shared';
import { setTimeout as delay } from 'node:timers/promises';

async function retrySqliteTimeout<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P1008' || attempt >= 2) throw error;
      await delay(25 * (attempt + 1));
    }
  }
}

/** Durable cross-process permit storage; transactions end before provider execution. */
export class AiCallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(id: string, limit: number): Promise<void> {
    await retrySqliteTimeout(() =>
      this.prisma.aiCallLease.upsert({
        where: { id },
        create: {
          id,
          state: 'waiting',
          limit,
          leaseUntil: new Date(Date.now() + AnalysisPolicy.leaseMs),
        },
        update: {},
      }),
    );
  }

  async tryAcquire(id: string, limit: number): Promise<boolean> {
    const now = new Date();
    await retrySqliteTimeout(() =>
      this.prisma.aiCallLease.deleteMany({ where: { leaseUntil: { lte: now } } }),
    );
    await retrySqliteTimeout(() =>
      this.prisma.aiCallLease.update({
        where: { id },
        data: { leaseUntil: new Date(now.getTime() + AnalysisPolicy.leaseMs) },
      }),
    );
    // SQLite serializes each UPDATE. Check capacity and FIFO within the same
    // statement so competing processes cannot both claim the final slot.
    const changed = await retrySqliteTimeout(
      () => this.prisma.$executeRaw`
      UPDATE "AiCallLease" SET "state" = 'running'
      WHERE "id" = ${id} AND "state" = 'waiting'
        AND "leaseUntil" > ${now}
        AND "id" = (SELECT "id" FROM "AiCallLease"
          WHERE "state" = 'waiting' AND "leaseUntil" > ${now}
          ORDER BY "createdAt", "id" LIMIT 1)
        AND (SELECT COUNT(*) FROM "AiCallLease"
          WHERE "state" = 'running' AND "leaseUntil" > ${now})
          < MIN(${limit}, (SELECT MIN("limit") FROM "AiCallLease" WHERE "leaseUntil" > ${now}))
    `,
    );
    if (changed === 1) return true;
    // A timed-out UPDATE may have committed; the caller owns this unique ID.
    const row = await retrySqliteTimeout(() =>
      this.prisma.aiCallLease.findUnique({ where: { id } }),
    );
    return row?.state === 'running' && row.leaseUntil > new Date();
  }

  async renew(id: string): Promise<boolean> {
    const changed = await retrySqliteTimeout(() =>
      this.prisma.aiCallLease.updateMany({
        where: { id, state: 'running', leaseUntil: { gt: new Date() } },
        data: { leaseUntil: new Date(Date.now() + AnalysisPolicy.leaseMs) },
      }),
    );
    return changed.count > 0;
  }

  async remove(id: string): Promise<void> {
    await retrySqliteTimeout(() => this.prisma.aiCallLease.deleteMany({ where: { id } }));
  }
}
