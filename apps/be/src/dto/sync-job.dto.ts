import {
  type SyncChannelStatus,
  type SyncJobClaim,
  type SyncJobStatus,
  type SyncJobUpdate,
} from '@ggaddak/shared';
import type { SkippedAnalysisSession } from '../domain/analysis-workflow.js';

export interface SyncSkippedSession extends SkippedAnalysisSession {
  requestId: string;
  recoveryState: string;
  nextAttemptAt?: string;
}

export type SyncJobView = {
  jobId: string;
  guildId: string;
  forceFullSync: boolean;
  status: SyncJobStatus;
  totalChannels: number;
  completedChannels: number;
  failedChannels: number;
  decisionsFound: number;
  skippedSessionCount?: number;
  damagedSessionCount?: number;
  skippedSessions?: SyncSkippedSession[];
  messagesScanned: number;
  receivedChannels?: number;
  analysisPendingChannels?: number;
  channels?: Array<{ id: string; status: SyncChannelStatus }>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
export interface SyncJobClaimDto extends SyncJobView, SyncJobClaim {}
export type SyncJobUpdateDto = SyncJobUpdate;
