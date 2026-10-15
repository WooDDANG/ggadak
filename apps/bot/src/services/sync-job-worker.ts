import type { SyncJobClaim, SyncJobUpdate as SyncWorkerUpdate } from '@ggaddak/shared';
import { ScanIncompleteError } from './harvester.service.js';
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
    }>,
  ) {}

  async runOnce(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const job = await this.backend.claimSyncJob();
      if (!job) return;
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
      const timer = setInterval(renew, 30_000);
      timer.unref();
      const checkLease = async () => {
        await heartbeat;
        if (leaseFailure) throw leaseFailure;
      };
      try {
        for (const channelId of job.channelIds) {
          await checkLease();
          // Verify ownership before starting another Discord scan.
          await this.backend.updateSyncJob(job.jobId, { owner: job.owner });
          let channelResult: NonNullable<SyncWorkerUpdate['channelResult']>;
          try {
            const result = await this.scan(job, channelId);
            channelResult = {
              channelId,
              status: 'COMPLETED',
              messagesScanned: result.scannedCount,
              decisionsFound: result.decisionsCount,
            };
          } catch (error) {
            // A timed-out delivery can still be running in BE. Keep the job recoverable
            // rather than publishing a failed channel while retained requests are pending.
            if (error instanceof ScanIncompleteError && error.pending > 0) throw error;
            channelResult = {
              channelId,
              status: 'FAILED',
              messagesScanned: 0,
              decisionsFound: 0,
              errorMessage: error instanceof Error ? error.message : String(error),
            };
          }
          await checkLease();
          await this.backend.updateSyncJob(job.jobId, { owner: job.owner, channelResult });
        }
        clearInterval(timer);
        await checkLease();
        // BE derives COMPLETED/FAILED from persisted channel results.
        await this.backend.updateSyncJob(job.jobId, { owner: job.owner, status: 'COMPLETED' });
      } finally {
        clearInterval(timer);
        await heartbeat;
      }
    } finally {
      this.busy = false;
    }
  }
}
