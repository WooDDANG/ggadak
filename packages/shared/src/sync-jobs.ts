export interface SyncChannelResult {
  channelId: string;
  status: 'COMPLETED' | 'FAILED';
  messagesScanned: number;
  decisionsFound: number;
  errorMessage?: string;
}
export interface SyncJobUpdate {
  owner: string;
  channelResult?: SyncChannelResult;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface SyncJobClaim {
  jobId: string;
  owner: string;
  forceFullSync: boolean;
  channelIds: string[];
}
