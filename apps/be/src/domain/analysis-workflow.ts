export const AnalysisRequestState = {
  Pending: 'pending',
  Processing: 'processing',
  Committing: 'committing',
  Completed: 'completed',
  Terminal: 'terminal',
} as const;
export type AnalysisRequestState = (typeof AnalysisRequestState)[keyof typeof AnalysisRequestState];
import type { AiSettings } from './ai-call.js';
import type { DiscussionMessage } from './analysis.js';
import type { GraphSession } from './decision-graph.js';

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
  phase: AnalysisPhase;
  provider?: string;
  model?: string;
  owner?: string;
  deadline?: number;
  verification?: unknown;
  error?: { message: string; status: number };
  startedAt: number;
  timeoutMs: number;
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
  elapsedMs: number;
  calls: AnalysisPhase[];
  attempts: StageAttempt[];
  active?: number;
  idMap: Record<string, string>;
  graph?: GraphSession;
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
    logicalCalls: number;
    attempts: number;
    inputTokens: number;
    outputTokens: number;
  }[];
}
