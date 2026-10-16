import { AnalysisScanState } from '@ggaddak/shared';
import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository.js';

/** Sync Job storage and conditional writes; the Service owns lifecycle policy. */
export class SyncJobRepository extends BaseRepository {
  active() {
    return this.prisma.syncJob.findMany({
      where: { status: 'PROCESSING' },
      select: { id: true },
      take: 100,
    });
  }
  patch(id: string, data: Prisma.SyncJobUpdateInput, tx: Prisma.TransactionClient) {
    return tx.syncJob.update({ where: { id }, data });
  }
  scan(jobId: string, channelId: string, tx: Prisma.TransactionClient, sealed = false) {
    return tx.analysisScan.findFirst({
      where: { jobId, channelId, ...(sealed ? { state: AnalysisScanState.Sealed } : {}) },
    });
  }
  upsertLock(guildId: string, jobId: string, tx: Prisma.TransactionClient) {
    return tx.syncJobLock.upsert({
      where: { guildId },
      create: { guildId, jobId },
      update: { jobId },
    });
  }
  monitoredChannels(guildId: string) {
    return this.prisma.monitoredChannel.findMany({ where: { guildId }, orderBy: { id: 'asc' } });
  }

  getLock(guildId: string, tx: Prisma.TransactionClient) {
    return tx.syncJobLock.findUnique({ where: { guildId } });
  }

  getById(id: string, tx: Prisma.TransactionClient) {
    return tx.syncJob.findUnique({ where: { id } });
  }

  getForGuild(id: string, guildId: string) {
    return this.prisma.syncJob.findFirst({ where: { id, guildId } });
  }

  releaseLock(guildId: string, tx: Prisma.TransactionClient, jobId?: string) {
    return tx.syncJobLock.deleteMany({ where: { guildId, ...(jobId ? { jobId } : {}) } });
  }

  create(data: Prisma.SyncJobUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.syncJob.create({ data });
  }

  lockGuild(guildId: string, jobId: string, tx: Prisma.TransactionClient) {
    return tx.syncJobLock.create({ data: { guildId, jobId } });
  }

  async claimNext(owner: string, now: Date, leaseUntil: Date) {
    return this.withPrismaErrors(async () => {
      const eligible = {
        OR: [{ status: 'QUEUED' }, { status: 'PROCESSING', leaseUntil: { lte: now } }],
      };
      const job = await this.prisma.syncJob.findFirst({
        where: eligible,
        orderBy: { createdAt: 'asc' },
      });
      if (!job) return null;
      const changed = await this.prisma.syncJob.updateMany({
        where: { id: job.id, ...eligible },
        data: { status: 'PROCESSING', owner, startedAt: job.startedAt ?? now, leaseUntil },
      });
      return changed.count === 1 ? job : null;
    });
  }

  async writeClaimed(
    id: string,
    owner: string,
    now: Date,
    data: Prisma.SyncJobUpdateManyMutationInput,
    tx: Prisma.TransactionClient,
  ): Promise<boolean> {
    const saved = await tx.syncJob.updateMany({
      where: { id, owner, status: 'PROCESSING', leaseUntil: { gt: now } },
      data,
    });
    return saved.count === 1;
  }
}
