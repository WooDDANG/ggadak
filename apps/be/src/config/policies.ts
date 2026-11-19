import { DurationMs } from '@ggaddak/shared';

export const AuthPolicy = {
  accessTokenTtlMs: 15 * DurationMs.Minute,
  oauthStateTtlMs: 5 * DurationMs.Minute,
  refreshWaitMs: 35_000,
  refreshLeaseMs: 45_000,
  sessionTtlMs: 7 * DurationMs.Day,
} as const;
/** 건너뛴 세션의 자동 재시도와 입력 보관(ADR-0028). */
export const RecoveryPolicy = {
  firstRetryDelayMs: DurationMs.Minute,
  retryDelayMs: 5 * DurationMs.Minute,
  busyRetryDelayMs: DurationMs.Second,
  maxAutomaticAttempts: 2,
  inputRetentionMs: 30 * DurationMs.Day,
} as const;
export const GraphPolicy = {
  maxTextChars: 10_000,
  maxNodes: 500,
  maxEdges: 2_000,
  maxProblems: 500,
  maxVerificationIssues: 500,
  // 논리 호출 상한 5회 × 호출 제한 30초.
  sessionBudgetMs: 150_000,
  callTimeoutMs: 30_000,
  maxLogicalCalls: 5,
  maxRepairs: 2,
} as const;
export const AiDefaults = {
  provider: 'nvidia',
  agyExecutable: 'agy',
  nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
  nvidiaEnableThinking: false,
  maxOutputTokens: 8192,
  models: {
    agy: 'gemini-3.8-flash-low',
    nvidia: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  },
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
} as const;
