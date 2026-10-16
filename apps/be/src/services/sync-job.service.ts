import {
  AnalysisReceiptState,
  AnalysisScanState,
  asyncDeliveryEnabled,
  includesValue,
  parseSyncJobStatus,
  type SyncChannelResult,
  SyncChannelStatus,
  SyncJobPolicy,
  SyncJobStatus,
  type SyncJobUpdate,
} from '@ggaddak/shared';

import { AnalysisQueueRepository } from '../repositories/analysis-queue.repository.js';

import { SyncJobRepository } from '../repositories/sync-job.repository.js';
import type { SyncJobView, SyncJobClaimDto } from '../dto/sync-job.dto.js';

import type { SyncJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';

const view = (job: SyncJob): SyncJobView => ({
  jobId: job.id,
  guildId: job.guildId,
  forceFullSync: job.forceFullSync,
  status: parseSyncJobStatus(job.status),
  totalChannels: job.totalChannels,
  completedChannels: job.completedChannels,
  failedChannels: job.failedChannels,
  decisionsFound: job.decisionsFound,
  messagesScanned: job.messagesScanned,
  receivedChannels: Object.values(
    JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>,
  ).filter(r => r.status === SyncChannelStatus.Received || r.status === SyncJobStatus.Completed)
    .length,
  channels: (JSON.parse(job.channelIdsJson) as string[]).map(id => ({
    id,
    status:
      (JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>)[id]?.status ??
      SyncChannelStatus.Waiting,
  })),
  analysisPendingChannels: Object.values(
    JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>,
  ).filter(r => r.status === SyncChannelStatus.Received).length,
  errorMessage: job.errorMessage,
  createdAt: job.createdAt.toISOString(),
  startedAt: job.startedAt?.toISOString() ?? null,
  completedAt: job.completedAt?.toISOString() ?? null,
});

@Service()
export class SyncJobService {
  private queue: AnalysisQueueRepository;
  private jobs: SyncJobRepository;
  constructor(private repo: DecisionRepository) {
    this.queue = new AnalysisQueueRepository(repo.prisma);
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
          if (
            current &&
            includesValue([SyncJobStatus.Queued, SyncJobStatus.Processing], current.status)
          )
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
    await this.reconcile(jobId);
    const job = await this.jobs.getForGuild(jobId, guildId);
    if (!job) throw new NotFoundError('Sync Job not found');
    return view(job);
  }

  async claim(deliveryOnly = asyncDeliveryEnabled()): Promise<SyncJobClaimDto | null> {
    if (deliveryOnly) {
      const active = await this.jobs.active();
      for (const job of active) await this.reconcile(job.id);
    }
    const now = new Date();
    const owner = randomUUID();
    const job = await this.jobs.claimNext(
      owner,
      now,
      new Date(now.getTime() + SyncJobPolicy.leaseMs),
    );
    if (!job) return null;
    const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
    return {
      ...view({ ...job, status: SyncJobStatus.Processing, startedAt: job.startedAt ?? now }),
      owner,
      ...(deliveryOnly ? { deliveryOnly: true } : {}),
      channelIds: (JSON.parse(job.channelIdsJson) as string[])
        .filter(id =>
          deliveryOnly ? !results[id] : results[id]?.status !== SyncJobStatus.Completed,
        )
        .slice(0, deliveryOnly ? 1 : undefined),
    };
  }

  async update(jobId: string, update: SyncJobUpdate): Promise<void> {
    await this.jobs.withTransaction(async tx => {
      const job = await this.jobs.getById(jobId, tx);
      if (!job) throw new NotFoundError('Sync Job not found');
      if (!update.owner || job.owner !== update.owner)
        throw new ConflictError('Sync worker lost its lease');
      if (job.status === SyncJobStatus.Completed || job.status === SyncJobStatus.Failed) return;
      if (
        job.status !== SyncJobStatus.Processing ||
        !job.leaseUntil ||
        job.leaseUntil <= new Date()
      )
        throw new ConflictError('Sync worker lost its lease');
      const channelIds = JSON.parse(job.channelIdsJson) as string[];
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      const result = update.channelResult;
      if (result) {
        if (
          !channelIds.includes(result.channelId) ||
          !includesValue(
            [SyncJobStatus.Completed, SyncJobStatus.Failed, SyncChannelStatus.Received],
            result.status,
          ) ||
          !Number.isSafeInteger(result.messagesScanned) ||
          result.messagesScanned < 0 ||
          !Number.isSafeInteger(result.decisionsFound) ||
          result.decisionsFound < 0
        )
          throw new BadRequestError('Invalid channel result');
        if (result.status === SyncChannelStatus.Received) {
          const scan = await this.jobs.scan(jobId, result.channelId, tx, true);
          if (!scan) throw new ConflictError('Channel has not been durably received');
          const current = channelIds.find(id => !results[id]);
          if (current !== result.channelId && !results[result.channelId])
            throw new ConflictError('Channel is not the current transfer');
        }
        results[result.channelId] = result;
      }
      const values = Object.values(results);
      const completedChannels = values.filter(
        item => item.status === SyncJobStatus.Completed,
      ).length;
      const failedChannels = values.filter(item => item.status === SyncJobStatus.Failed).length;
      const terminal =
        update.status === SyncJobStatus.Completed ||
        update.status === SyncJobStatus.Failed ||
        (update.release === true &&
          values.length === channelIds.length &&
          values.every(r => r.status !== SyncChannelStatus.Received));
      if (
        terminal &&
        (values.length !== channelIds.length ||
          values.some(r => r.status === SyncChannelStatus.Received))
      )
        throw new ConflictError('Sync still has unfinished channels');
      const status = terminal
        ? failedChannels
          ? SyncJobStatus.Failed
          : SyncJobStatus.Completed
        : SyncJobStatus.Processing;
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
                  .filter(item => item.status === SyncJobStatus.Failed)
                  .map(item => item.errorMessage ?? `${item.channelId}: scan failed`)
                  .join('; ')
              : null,
          ...(update.release ? { owner: null } : {}),
          leaseUntil: terminal
            ? null
            : update.release
              ? new Date(0)
              : new Date(Date.now() + SyncJobPolicy.leaseMs),
          completedAt: terminal ? new Date() : null,
        },
        tx,
      );
      if (!saved) throw new ConflictError('Sync worker lost its lease');
      if (terminal) await this.jobs.releaseLock(job.guildId, tx, jobId);
    });
  }
  async reconcile(jobId: string): Promise<void> {
    await this.jobs.withTransaction(async tx => {
      const job = await this.jobs.getById(jobId, tx);
      if (!job || !includesValue([SyncJobStatus.Processing, SyncJobStatus.Failed], job.status))
        return;
      // Fence against a concurrent Bot progress update before deriving persisted results.
      await this.jobs.patch(jobId, { status: job.status }, tx);
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      let changed = false;
      for (const channelId of Object.keys(results)) {
        if (
          !includesValue(
            [SyncChannelStatus.Received, SyncJobStatus.Failed],
            results[channelId].status,
          )
        )
          continue;
        const scan = await this.jobs.scan(jobId, channelId, tx, true);
        if (!scan) continue;
        const rows = await this.queue.ranges(scan.id, tx);
        if (
          rows.some(
            r =>
              r.state !== AnalysisReceiptState.Completed && r.state !== AnalysisReceiptState.Failed,
          )
        )
          continue;
        const failed = rows.some(r => r.state === AnalysisReceiptState.Failed);
        let decisions = 0;
        for (const row of rows) {
          const a = await this.queue.analysis(row.id, tx);
          if (a?.resultJson) decisions += JSON.parse(a.resultJson).decisions.length;
        }
        const next: SyncChannelResult = {
          ...results[channelId],
          status: failed ? SyncJobStatus.Failed : SyncJobStatus.Completed,
          decisionsFound: decisions,
          ...(failed ? { errorMessage: 'Analysis failure retained; retry from recovery' } : {}),
        };
        if (!failed) delete next.errorMessage;
        if (JSON.stringify(next) !== JSON.stringify(results[channelId])) changed = true;
        results[channelId] = next;
      }
      if (!changed) return;
      const values = Object.values(results),
        done = values.filter(r => r.status === SyncJobStatus.Completed).length,
        failed = values.filter(r => r.status === SyncJobStatus.Failed).length;
      const terminal = done + failed === job.totalChannels;
      await this.jobs.patch(
        jobId,
        {
          channelResultsJson: JSON.stringify(results),
          completedChannels: done,
          failedChannels: failed,
          decisionsFound: values.reduce((n, r) => n + r.decisionsFound, 0),
          ...(terminal
            ? {
                status: failed ? SyncJobStatus.Failed : SyncJobStatus.Completed,
                completedAt: new Date(),
                owner: null,
                leaseUntil: null,
                errorMessage: failed
                  ? 'Some channels failed; retained inputs can be retried'
                  : null,
              }
            : {}),
        },
        tx,
      );
      if (terminal) await this.jobs.releaseLock(job.guildId, tx, jobId);
    });
  }
  async resume(jobId: string, guildId: string, channelId: string): Promise<SyncJobView> {
    await this.jobs.withTransaction(async tx => {
      const job = await this.jobs.getById(jobId, tx);
      if (!job || job.guildId !== guildId) throw new NotFoundError('Sync Job not found');
      if (!includesValue([SyncJobStatus.Completed, SyncJobStatus.Failed], job.status))
        throw new ConflictError('Wait for the current transfer to finish');
      const lock = await this.jobs.getLock(guildId, tx);
      if (lock && lock.jobId !== jobId) throw new ConflictError('Another scan is active');
      const results = JSON.parse(job.channelResultsJson) as Record<string, SyncChannelResult>;
      if (results[channelId]?.status !== SyncJobStatus.Failed)
        throw new ConflictError('Only failed channel transfers can resume');
      const scan = await this.jobs.scan(jobId, channelId, tx);
      if (scan?.state === AnalysisScanState.Sealed)
        throw new ConflictError('Data already received; retry analysis from recovery');
      delete results[channelId];
      await this.jobs.patch(
        jobId,
        {
          status: SyncJobStatus.Queued,
          owner: null,
          leaseUntil: null,
          completedAt: null,
          errorMessage: null,
          channelResultsJson: JSON.stringify(results),
          failedChannels: Object.values(results).filter(r => r.status === SyncJobStatus.Failed)
            .length,
        },
        tx,
      );
      await this.jobs.upsertLock(guildId, jobId, tx);
    });
    return this.get(jobId, guildId);
  }
}
