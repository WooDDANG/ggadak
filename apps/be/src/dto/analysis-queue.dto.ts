import { AnalysisReceiptState, AnalysisScanState } from '@ggaddak/shared';
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
  state: AnalysisReceiptState;
  attempts: number;
  nextAttemptAt: string;
  errorCategory: string | null;
  inputRetained: boolean;
  result?: AnalyzeDiscussionResponseDto;
  receivedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface QueueCapacityDto {
  acceptingScans: boolean;
  pending: number;
  retainedBytes: number;
  oldestWaitingMs: number;
  pauseUntil: string | null;
  maxBytes: number;
  maxChannelBytes: number;
  maxPending: number;
  states: Array<{ state: AnalysisReceiptState; count: number; bytes: number }>;
}
export interface ScanReceiptDto {
  id: string;
  state: AnalysisScanState;
}
export interface ScanStatusDto extends ScanReceiptDto {
  expectedRanges: number | null;
  receivedRanges: number;
  completed: number;
  failed: number;
  bytes: number;
  missing: number[];
}
export interface ScanSealDto {
  sealed: boolean;
  missing: number[];
}
export interface ScanSealBody {
  expectedRanges: number;
}
export interface ResultAckBody {
  ids: string[];
}
