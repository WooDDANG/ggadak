import type { SyncJobClaim, SyncJobUpdate } from '@ggaddak/shared';

export type SyncJobView = {
  jobId: string;
  guildId: string;
  forceFullSync: boolean;
  status: string;
  totalChannels: number;
  completedChannels: number;
  failedChannels: number;
  decisionsFound: number;
  messagesScanned: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
export interface SyncJobClaimDto extends SyncJobView, SyncJobClaim {}
export type SyncJobUpdateDto = SyncJobUpdate;
