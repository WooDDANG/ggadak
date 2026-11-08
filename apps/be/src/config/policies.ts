import { DurationMs } from '@ggaddak/shared';

export const AuthPolicy = {
  accessTokenTtlMs: 15 * DurationMs.Minute,
  oauthStateTtlMs: 5 * DurationMs.Minute,
  refreshWaitMs: 35_000,
  refreshLeaseMs: 45_000,
  sessionTtlMs: 7 * DurationMs.Day,
} as const;
export const GraphPolicy = {
  maxTextChars: 10_000,
  maxNodes: 500,
  maxEdges: 2_000,
  maxProblems: 500,
  maxVerificationIssues: 500,
  sessionBudgetMs: 180_000,
  callTimeoutMs: 20_000,
  maxLogicalCalls: 4,
  maxRepairs: 1,
} as const;
export const AiDefaults = {
  provider: 'nvidia',
  agyExecutable: 'agy',
  nvidiaBaseUrl: 'https://integrate.api.nvidia.com/v1',
  nvidiaEnableThinking: true,
  maxOutputTokens: 16384,
  models: {
    agy: 'gemini-3.8-flash-low',
    nvidia: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
  },
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
} as const;
