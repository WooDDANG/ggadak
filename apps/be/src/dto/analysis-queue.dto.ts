import type {
  AnalyzeDiscussionRequestDto,
  AnalyzeDiscussionResponseDto,
} from './discussion.dto.js';

export interface ScanRangeDto {
  afterMessageId: string;
  startMessageId: string;
  endMessageId: string;
}
export interface ReceiptBody {
  input: AnalyzeDiscussionRequestDto;
  scanId?: string;
  rangeIndex?: number;
  range?: ScanRangeDto;
}
export interface ScanBody {
  id: string;
  guildId: string;
  channelId: string;
  upperMessageId: string;
  afterMessageId: string;
  jobId?: string;
  jobOwner?: string;
}
export interface ReceiptView {
  requestId: string;
  state: string;
  attempts: number;
  nextAttemptAt: string;
  errorCategory: string | null;
  inputRetained: boolean;
  result?: AnalyzeDiscussionResponseDto;
  receivedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
