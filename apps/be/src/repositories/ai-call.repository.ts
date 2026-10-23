import type { PrismaClient } from '@prisma/client';
import { AnalysisPolicy } from '@ggaddak/shared';

/** Durable cross-process permit storage; transactions end before provider execution. */
export class AiCallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(id: string, limit: number): Promise<void> {
    await this.prisma.aiCallLease.create({
      data: {
        id,
        state: 'waiting',
        limit,
        leaseUntil: new Date(Date.now() + AnalysisPolicy.leaseMs),
      },
    });
  }

  async tryAcquire(id: string, limit: number): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      await tx.analysisQueueControl.upsert({
        where: { id: 'ai-calls' },
        create: { id: 'ai-calls' },
        update: { revision: { increment: 1 } },
      });
      const now = new Date();
      await tx.aiCallLease.deleteMany({ where: { leaseUntil: { lte: now } } });
      await tx.aiCallLease.update({
        where: { id },
        data: { leaseUntil: new Date(now.getTime() + AnalysisPolicy.leaseMs) },
      });
      const rows = await tx.aiCallLease.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const cap = Math.min(limit, ...rows.map(row => row.limit));
      if (
        rows.filter(row => row.state === 'running').length >= cap ||
        rows.find(row => row.state === 'waiting')?.id !== id
      )
        return false;
      await tx.aiCallLease.update({ where: { id }, data: { state: 'running' } });
      return true;
    });
  }

  async renew(id: string): Promise<boolean> {
    const changed = await this.prisma.aiCallLease.updateMany({
      where: { id, state: 'running', leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + AnalysisPolicy.leaseMs) },
    });
    return changed.count > 0;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.aiCallLease.deleteMany({ where: { id } });
  }
}
