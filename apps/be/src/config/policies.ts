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
  // 논리 호출 상한 5회 × 호출 제한 60초.
  sessionBudgetMs: 300_000,
  callTimeoutMs: 60_000,
  maxLogicalCalls: 5,
  maxRepairs: 2,
  // 호출 차례를 받은 뒤 빈 NVIDIA 키를 기다리는 최대 시간. 다른 호출이 쥔 키는 그 호출이 끝나면
  // 풀린다. 실측 호출은 대부분 25초 안에 끝났다(2026-11-19, 메시지 40개 세션 Extract 30회 최대 24초).
  // 이보다 오래 걸리는 대기(분당 예산 소진, 긴 429 cooldown)는 차례를 쥔 채 붙잡지 않고 큐 대기로 넘긴다.
  maxKeyWaitMs: 30 * DurationMs.Second,
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
