import {
  createLogger,
  SyncChannelStatus,
  type SyncJobClaim,
  SyncJobPolicy,
  SyncJobStatus,
  type SyncJobUpdate as SyncWorkerUpdate,
} from '@ggaddak/shared';

import { ScanIncompleteError } from './harvester.service.js';
import { AnalysisDeliveryError, BackendRequestError } from './backend-api.service.js';
const logger = createLogger('BOT-SYNC-WORKER');
export type { SyncJobClaim, SyncJobUpdate as SyncWorkerUpdate } from '@ggaddak/shared';

interface SyncWorkerBackend {
  claimSyncJob(): Promise<SyncJobClaim | null>;
  updateSyncJob(jobId: string, update: SyncWorkerUpdate): Promise<void>;
}

/** Owns one claimed job through channel scans, progress reports and lease renewal. */
export class SyncJobWorker {
  private busy = false;

  constructor(
    private backend: SyncWorkerBackend,
    private scan: (
      job: SyncJobClaim,
      channelId: string,
    ) => Promise<{
      scannedCount: number;
      decisionsCount: number;
      pendingAnalysis?: boolean;
    }>,
  ) {}

  async runOnce(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const job = await this.backend.claimSyncJob();
      if (!job) return;
      logger.info('sync.job.claimed', {
        jobId: job.jobId,
        channels: job.channelIds.length,
        deliveryOnly: job.deliveryOnly,
      });
      let leaseFailure: unknown;
      let heartbeat: Promise<void> | undefined;
      const renew = () => {
        if (heartbeat || leaseFailure) return;
        heartbeat = this.backend
          .updateSyncJob(job.jobId, { owner: job.owner })
          .catch(error => {
            leaseFailure = error;
          })
          .finally(() => {
            heartbeat = undefined;
          });
      };
      const timer = setInterval(renew, SyncJobPolicy.heartbeatMs);
      timer.unref();
      const checkLease = async () => {
        await heartbeat;
        if (leaseFailure) throw leaseFailure;
      };
      try {
        for (const channelId of job.channelIds) {
          logger.info('sync.channel.started', { jobId: job.jobId, channelId });
          await checkLease();
          // Verify ownership before starting another Discord scan.
          await this.backend.updateSyncJob(job.jobId, { owner: job.owner });
          let channelResult: NonNullable<SyncWorkerUpdate['channelResult']>;
          try {
            const result = await this.scan(job, channelId);
            channelResult = {
              channelId,
              status: job.deliveryOnly ? SyncChannelStatus.Received : SyncJobStatus.Completed,
              messagesScanned: result.scannedCount,
              decisionsFound: result.decisionsCount,
            };
          } catch (error) {
            if (
              job.deliveryOnly &&
              ((error instanceof AnalysisDeliveryError && error.outcome === 'retry-pending') ||
                (error instanceof BackendRequestError &&
                  [429, 503, 507].includes(error.statusCode)))
            ) {
              logger.warn('sync.job.retry_pending', { jobId: job.jobId, channelId });
              await this.backend.updateSyncJob(job.jobId, { owner: job.owner, release: true });
              return;
            }
            // A timed-out delivery can still be running in BE. Keep the job recoverable
            // rather than publishing a failed channel while retained requests are pending.
            if (error instanceof ScanIncompleteError && error.pending > 0) throw error;
            channelResult = {
              channelId,
              status: SyncJobStatus.Failed,
              messagesScanned: 0,
              decisionsFound: 0,
              errorMessage: error instanceof Error ? error.message : String(error),
            };
            logger.warn('sync.channel.failed', {
              jobId: job.jobId,
              channelId,
              errorType: error instanceof Error ? error.name : 'unknown',
            });
          }
          await checkLease();
          await this.backend.updateSyncJob(job.jobId, { owner: job.owner, channelResult });
          if (channelResult.status !== SyncJobStatus.Failed)
            logger.info('sync.channel.reported', {
              jobId: job.jobId,
              channelId,
              status: channelResult.status,
              messagesScanned: channelResult.messagesScanned,
              decisionsFound: channelResult.decisionsFound,
            });
        }
        clearInterval(timer);
        await checkLease();
        // BE derives COMPLETED/FAILED from persisted channel results.
        await this.backend.updateSyncJob(
          job.jobId,
          job.deliveryOnly
            ? { owner: job.owner, release: true }
            : { owner: job.owner, status: SyncJobStatus.Completed },
        );
        logger.info('sync.job.reported', { jobId: job.jobId, deliveryOnly: job.deliveryOnly });
      } finally {
        clearInterval(timer);
        await heartbeat;
      }
    } finally {
      this.busy = false;
    }
  }
}
