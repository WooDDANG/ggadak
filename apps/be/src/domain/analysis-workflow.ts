export const AnalysisRequestState = {
  Pending: 'pending',
  Processing: 'processing',
  Committing: 'committing',
  Completed: 'completed',
  Terminal: 'terminal',
} as const;
export type AnalysisRequestState = (typeof AnalysisRequestState)[keyof typeof AnalysisRequestState];
import type { AiSettings } from './ai-call.js';
import type { AiFailureKind } from './ai-call.js';
import type { DiscussionMessage } from './analysis.js';
import type { GraphDamage, GraphSession } from './decision-graph.js';

export const AnalysisPhase = {
  Extract: 'extract',
  Check: 'check',
  Verify: 'verify',
  Repair: 'repair',
  Recheck: 'recheck',
  Reverify: 'reverify',
  Done: 'done',
} as const;
export type AnalysisPhase = (typeof AnalysisPhase)[keyof typeof AnalysisPhase];
export interface StageAttempt {
  callId?: string;
  phase: AnalysisPhase;
  provider?: string;
  model?: string;
  owner?: string;
  deadline?: number;
  verification?: unknown;
  error?: {
    message: string;
    status: number;
    failureKind?: string;
    retryable?: boolean;
    providerResponse?: string;
  };
  startedAt: number;
  timeoutMs: number;
  waitMs?: number;
  endedAt?: number;
  outcome?: 'completed' | 'failed' | 'interrupted';
  inputTokens?: number;
  outputTokens?: number;
}
export interface AnalysisSession {
  id: string;
  messages: DiscussionMessage[];
  transcript: string;
  phase: AnalysisPhase;
  value?: unknown;
  feedback: string[];
  verification?: unknown;
  repairs: number;
  repairBudgets?: { structure: number; semantic: number };
  elapsedMs: number;
  waitMs?: number;
  calls: AnalysisPhase[];
  attempts: StageAttempt[];
  active?: number;
  idMap: Record<string, string>;
  graph?: GraphSession;
  damage?: GraphDamage[];
  skippedFailure?: SkippedAnalysisSession;
}
export interface SkippedAnalysisSession {
  sessionId: string;
  messageIds: string[];
  failedAt: string;
  kind: AiFailureKind;
  scanRange?: { afterMessageId: string; startMessageId: string; endMessageId: string };
}
export interface AnalysisWorkflow {
  version: 1;
  settings: AiSettings;
  sessions: AnalysisSession[];
  skipped: boolean;
}
export interface AnalysisFailure {
  category: string;
  message: string;
  status: number;
  retryable: boolean;
}
export interface AnalysisStatus {
  requestId: string;
  state: string;
  graphAvailable: boolean;
  retryable: boolean;
  error: AnalysisFailure | null;
  sessions: {
    sessionId: string;
    phase: AnalysisPhase;
    repairs: number;
    elapsedMs: number;
    waitMs?: number;
    logicalCalls: number;
    attempts: number;
    inputTokens: number;
    outputTokens: number;
    damageCount?: number;
    skippedFailure?: SkippedAnalysisSession;
    recovery?: {
      state: string;
      attempts: number;
      nextAttemptAt: string;
      expiresAt: string;
      /** 가장 최근 실패의 종류. 최초 건너뜀 또는 마지막 자동 재시도의 실패다. */
      failureKind?: string;
    };
    failure?: {
      stage: AnalysisPhase;
      kind: 'timeout' | 'configuration' | 'validation' | 'provider';
      action: 'retry' | 'new-analysis';
      summary: string;
    };
  }[];
}
