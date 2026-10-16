export interface AnalysisDeliveryStatusDto {
  requestId: string;
  guildId: string;
  channelId: string;
  channelName?: string;
  status:
    | 'pending'
    | 'retry-pending'
    | 'retained-failure'
    | 'completed-with-candidates'
    | 'completed-no-decision';
  attempts: number;
  nextAttemptAt: number;
  errorCategory?: string;
  lastError?: string;
  scanRange?: { afterMessageId: string; startMessageId: string; endMessageId: string };
}

export interface AnalysisDeliveryViewDto extends AnalysisDeliveryStatusDto {
  managedBy?: 'bot' | 'backend';
  phase?: string;
  inputRetained?: boolean;
  receivedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  requiresNewAnalysis?: boolean;
  synchronizedAt: string;
}

export interface AnalysisDeliveryQueueDto {
  requests: AnalysisDeliveryViewDto[];
  available: boolean;
  lastSynchronizedAt: string | null;
}

export interface AnalysisRetryCommandDto {
  id: string;
  requestId: string;
  guildId: string;
  createdAt: string;
  acknowledgedAt: string | null;
}
