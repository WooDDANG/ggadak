import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';

export type SyncJobView = {
  jobId: string; guildId: string; forceFullSync: boolean; status: string;
  totalChannels: number; completedChannels: number; failedChannels: number;
  decisionsFound: number; messagesScanned: number; errorMessage: string | null;
  createdAt: string; startedAt: string | null; completedAt: string | null;
};
const view = (job: any): SyncJobView => ({
  jobId: job.id, guildId: job.guildId, forceFullSync: job.forceFullSync, status: job.status,
  totalChannels: job.totalChannels, completedChannels: job.completedChannels,
  failedChannels: job.failedChannels, decisionsFound: job.decisionsFound,
  messagesScanned: job.messagesScanned, errorMessage: job.errorMessage,
  createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
});

@Service()
export class SyncJobService {
  constructor(private repo: DecisionRepository) {}

  async create(guildId: string, forceFullSync: boolean): Promise<SyncJobView> {
    const prisma = this.repo.prisma;
    const channels = await prisma.monitoredChannel.findMany({ where: { guildId }, orderBy: { id: 'asc' } });
    if (!channels.length) throw new BadRequestError('Select at least one monitored channel before syncing');
    const id = randomUUID();
    try {
      return await prisma.$transaction(async tx => {
        const lock = await tx.syncJobLock.findUnique({ where: { guildId } });
        if (lock) {
          const current = await tx.syncJob.findUnique({ where: { id: lock.jobId } });
          if (current && ['QUEUED', 'PROCESSING'].includes(current.status) && (!current.leaseUntil || current.leaseUntil > new Date()))
            throw new ConflictError('A sync is already active for this server');
          await tx.syncJobLock.delete({ where: { guildId } });
        }
        const job = await tx.syncJob.create({ data: {
          id, guildId, forceFullSync, channelIdsJson: JSON.stringify(channels.map(c => c.id)), totalChannels: channels.length,
        } });
        await tx.syncJobLock.create({ data: { guildId, jobId: id } });
        return view(job);
      });
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.code === 'P2002') throw new ConflictError('A sync is already active for this server');
      throw error;
    }
  }

  async get(jobId: string, guildId: string): Promise<SyncJobView> {
    const job = await this.repo.prisma.syncJob.findFirst({ where: { id: jobId, guildId } });
    if (!job) throw new NotFoundError('Sync Job not found');
    return view(job);
  }

  async claim(): Promise<any | null> {
    const now = new Date();
    const prisma = this.repo.prisma;
    const job = await prisma.syncJob.findFirst({
      where: { OR: [{ status: 'QUEUED' }, { status: 'PROCESSING', leaseUntil: { lte: now } }] },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return null;
    const changed = await prisma.syncJob.updateMany({
      where: { id: job.id, OR: [{ status: 'QUEUED' }, { status: 'PROCESSING', leaseUntil: { lte: now } }] },
      data: { status: 'PROCESSING', startedAt: job.startedAt ?? now, leaseUntil: new Date(now.getTime() + 120_000) },
    });
    if (!changed.count) return null;
    return { ...view({ ...job, status: 'PROCESSING', startedAt: job.startedAt ?? now }), channelIds: JSON.parse(job.channelIdsJson) };
  }

  async update(jobId: string, update: { completedChannels?: number; failedChannels?: number; decisionsFound?: number; messagesScanned?: number; errorMessage?: string | null; status?: 'PROCESSING' | 'COMPLETED' | 'FAILED' }): Promise<void> {
    const prisma = this.repo.prisma;
    const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;
    const terminal = update.status === 'COMPLETED' || update.status === 'FAILED';
    await prisma.$transaction(async tx => {
      await tx.syncJob.update({ where: { id: jobId }, data: {
        ...update, leaseUntil: terminal ? null : new Date(Date.now() + 120_000),
        completedAt: terminal ? new Date() : undefined,
      } });
      if (terminal) await tx.syncJobLock.deleteMany({ where: { guildId: job.guildId, jobId } });
    });
  }
}
