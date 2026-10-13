import { SyncJobRepository } from '../repositories/sync-job.repository.js';
import type { SyncJobView, SyncJobClaimDto } from '../dto/sync-job.dto.js';
import type { SyncChannelResult, SyncJobUpdate } from '@ggaddak/shared';
import type { SyncJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';

const view = (job: SyncJob): SyncJobView => ({
  jobId: job.id,
  guildId: job.guildId,
  forceFullSync: job.forceFullSync,
  status: job.status,
  totalChannels: job.totalChannels,
  completedChannels: job.completedChannels,
  failedChannels: job.failedChannels,
  decisionsFound: job.decisionsFound,
  messagesScanned: job.messagesScanned,
  errorMessage: job.errorMessage,
  createdAt: job.createdAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
});

@Service()
export class SyncJobService {
  private jobs: SyncJobRepository;
  constructor(repo: DecisionRepository) {
    this.jobs = new SyncJobRepository(repo.prisma);
  }

  async create(guildId: string, forceFullSync: boolean): Promise<SyncJobView> {
    const channels = await this.jobs.monitoredChannels(guildId);
    if (!channels.length)
      throw new BadRequestError('Select at least one monitored channel before syncing');
    const id = randomUUID();
    try {
      return await this.jobs.withTransaction(async tx => {
        const lock = await this.jobs.getLock(guildId, tx);
        if (lock) {
          const current = await this.jobs.getById(lock.jobId, tx);
          if (current && ['QUEUED', 'PROCESSING'].includes(current.status))
            throw new ConflictError('A sync is already active for this server');
          await this.jobs.releaseLock(guildId, tx);
        }
        const job = await this.jobs.create(
          {
            id,
            guildId,
            forceFullSync,
            channelIdsJson: JSON.stringify(channels.map(c => c.id)),
            totalChannels: channels.length,
          },
          tx,
        );
        await this.jobs.lockGuild(guildId, id, tx);
        return view(job);
      });
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.code === 'P2002')
        throw new ConflictError('A sync is already active for this server');
      throw error;
    }
  }

  async get(jobId: string, guildId: string): Promise<SyncJobView> {
    const job = await this.jobs.getForGuild(jobId, guildId);
    if (!job) throw new NotFoundError('Sync Job not found');
    return view(job);
  }

  async claim(): Promise<SyncJobClaimDto | null> {
    const now = new Date();
    const owner = randomUUID();
    const job = await this.jobs.claimNext(owner, now, new Date(now.getTime() + 120_000));
    if (!job) return null;
    const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
    return {
      ...view({ ...job, status: 'PROCESSING', startedAt: job.startedAt ?? now }),
      owner,
      channelIds: (JSON.parse(job.channelIdsJson) as string[]).filter(
        id => results[id]?.status !== 'COMPLETED',
      ),
    };
  }

  async update(jobId: string, update: SyncJobUpdate): Promise<void> {
    await this.jobs.withTransaction(async tx => {
      const job = await this.jobs.getById(jobId, tx);
      if (!job) throw new NotFoundError('Sync Job not found');
      if (!update.owner || job.owner !== update.owner)
        throw new ConflictError('Sync worker lost its lease');
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return;
      if (job.status !== 'PROCESSING' || !job.leaseUntil || job.leaseUntil <= new Date())
        throw new ConflictError('Sync worker lost its lease');
      const channelIds = JSON.parse(job.channelIdsJson) as string[];
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      const result = update.channelResult;
      if (result) {
        if (
          !channelIds.includes(result.channelId) ||
          !['COMPLETED', 'FAILED'].includes(result.status) ||
          !Number.isSafeInteger(result.messagesScanned) ||
          result.messagesScanned < 0 ||
          !Number.isSafeInteger(result.decisionsFound) ||
          result.decisionsFound < 0
        )
          throw new BadRequestError('Invalid channel result');
        results[result.channelId] = result;
      }
      const values = Object.values(results);
      const completedChannels = values.filter(item => item.status === 'COMPLETED').length;
      const failedChannels = values.filter(item => item.status === 'FAILED').length;
      const terminal = update.status === 'COMPLETED' || update.status === 'FAILED';
      if (terminal && values.length !== channelIds.length)
        throw new ConflictError('Sync still has unfinished channels');
      const status = terminal ? (failedChannels ? 'FAILED' : 'COMPLETED') : 'PROCESSING';
      const saved = await this.jobs.writeClaimed(
        jobId,
        update.owner,
        new Date(),
        {
          channelResultsJson: JSON.stringify(results),
          completedChannels,
          failedChannels,
          messagesScanned: values.reduce((sum, item) => sum + item.messagesScanned, 0),
          decisionsFound: values.reduce((sum, item) => sum + item.decisionsFound, 0),
          status,
          errorMessage:
            terminal && failedChannels
              ? values
                  .filter(item => item.status === 'FAILED')
                  .map(item => item.errorMessage ?? `${item.channelId}: scan failed`)
                  .join('; ')
              : null,
          leaseUntil: terminal ? null : new Date(Date.now() + 120_000),
          completedAt: terminal ? new Date() : null,
        },
        tx,
      );
      if (!saved) throw new ConflictError('Sync worker lost its lease');
      if (terminal) await this.jobs.releaseLock(job.guildId, tx, jobId);
    });
  }
}
