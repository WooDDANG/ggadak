export interface SyncChannelResult {
  channelId: string;
  status: 'COMPLETED' | 'FAILED' | 'RECEIVED';
  messagesScanned: number;
  decisionsFound: number;
  errorMessage?: string;
}
export interface SyncJobUpdate {
  release?: boolean;
  owner: string;
  channelResult?: SyncChannelResult;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface SyncJobClaim {
  deliveryOnly?: boolean;
  jobId: string;
  owner: string;
  forceFullSync: boolean;
  channelIds: string[];
}
