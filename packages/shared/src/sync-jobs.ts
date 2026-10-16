import type { SyncChannelStatus, SyncJobStatus } from './domain-values.js';
export interface SyncChannelResult {
  channelId: string;
  status: Exclude<SyncChannelStatus, 'WAITING'>;
  messagesScanned: number;
  decisionsFound: number;
  errorMessage?: string;
}
export interface SyncJobUpdate {
  release?: boolean;
  owner: string;
  channelResult?: SyncChannelResult;
  status?: Exclude<SyncJobStatus, 'QUEUED'>;
}

export interface SyncJobClaim {
  deliveryOnly?: boolean;
  jobId: string;
  owner: string;
  forceFullSync: boolean;
  channelIds: string[];
}
