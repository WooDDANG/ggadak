import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { AnalysisRequestError } from '../repositories/analysis-request.repository.js';

/** Shared by synchronous compatibility callers and durable workers, across BE processes. */
export class AnalysisExecution {
  constructor(private prisma: PrismaClient) {}
  async acquire(requestId: string, channelId: string) {
    const max = Number(process.env.ANALYSIS_CONCURRENCY ?? 1);
    if (!Number.isSafeInteger(max) || max < 1 || max > 32)
      throw new Error('Invalid ANALYSIS_CONCURRENCY');
    return this.prisma.$transaction(async tx => {
      await tx.analysisQueueControl.upsert({
        where: { id: 'execution' },
        create: { id: 'execution' },
        update: { revision: { increment: 1 } },
      });
      const now = new Date();
      const active = await tx.analysisExecution.findMany({
        where: { leaseUntil: { gt: now }, owner: { not: null } },
      });
      if (active.length >= max || active.some(s => s.channelId === channelId))
        throw new AppError('Analysis capacity busy', 503);
      const slot = Array.from({ length: max }, (_, i) => String(i)).find(
        id => !active.some(s => s.id === id),
      )!;
      const owner = randomUUID();
      await tx.analysisExecution.upsert({
        where: { id: slot },
        create: { id: slot, owner, requestId, channelId, leaseUntil: new Date(Date.now() + 60000) },
        update: { owner, requestId, channelId, leaseUntil: new Date(Date.now() + 60000) },
      });
      return { slot, owner };
    });
  }
  async renew(lease: { slot: string; owner: string }) {
    const saved = await this.prisma.analysisExecution.updateMany({
      where: { id: lease.slot, owner: lease.owner, leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + 60000) },
    });
    if (!saved.count) throw new AnalysisRequestError('Analysis capacity ownership lost', 503);
  }
  release(lease: { slot: string; owner: string }) {
    return this.prisma.analysisExecution.updateMany({
      where: { id: lease.slot, owner: lease.owner },
      data: { owner: null, requestId: null, channelId: null, leaseUntil: null },
    });
  }
}
