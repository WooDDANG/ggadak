export const AiStage = { Extract: 'extract', Verify: 'verify', Repair: 'repair' } as const;
export type AiStage = (typeof AiStage)[keyof typeof AiStage];

/** 호출 신호의 중단 사유: 요청·슬롯 소유권 상실. 그 밖의 중단은 호출 타임아웃이다. */
export const LEASE_LOST = 'ai-call-lease-lost' as const;

/** provider 기본 샘플링 seed. 자동 재시도는 여기에 시도 번호를 더한다. */
export const DEFAULT_SEED = 42;

export interface AiSettings {
  provider: string;
  model: string;
  promptVersion: string;
  maxOutputTokens: number;
  maxInputChars: number;
  maxInputTokens?: number;
  stageModels?: Partial<Record<AiStage, string>>;
  /** 자동 재시도마다 바뀌는 샘플링 seed. 없으면 provider 기본값을 쓴다. */
  seed?: number;
}

export function modelForStage(settings: AiSettings, stage: AiStage | 'baseline'): string {
  return stage === 'baseline' ? settings.model : (settings.stageModels?.[stage] ?? settings.model);
}
export interface AiCallContext {
  signal: AbortSignal;
  settings: AiSettings;
  requestId?: string;
  callId?: string;
  traceId?: string;
  guildId?: string;
  channelId?: string;
  retryCount?: number;
  issuesCount?: number;
}
export interface AiResult {
  value: unknown;
  usage?: { inputTokens: number; outputTokens: number };
  ttftMs?: number;
}

/** AI 실패 코드. 던지는 쪽이 지정하며 재시도·건너뜀 판정의 기준이다. */
const failureKinds = [
  'timeout',
  'rate-limit',
  'provider',
  'auth',
  'graph-structure',
  'semantic-verification',
  'configuration',
  'output-empty',
  'output-unparseable',
  'output-truncated',
  'verify-format',
  'lease-lost',
  'budget-exhausted',
] as const;
export type AiFailureKind = (typeof failureKinds)[number];

/** 출력 형식 실패: 응답 자체가 약속된 형식을 지키지 못한 실패. */
export const OUTPUT_FORMAT_FAILURES: readonly AiFailureKind[] = [
  'output-empty',
  'output-unparseable',
  'output-truncated',
  'verify-format',
];
/** 세션에 국한된 실패: 동기화를 막지 않고 해당 세션만 건너뛴다(ADR-0028). */
export const SESSION_SCOPED_FAILURES: readonly AiFailureKind[] = [
  'graph-structure',
  'semantic-verification',
  'timeout',
  'budget-exhausted',
  ...OUTPUT_FORMAT_FAILURES,
];
/** 다시 시도해도 결과가 같거나(설정·인증·잘림) 실패가 아닌(소유권 상실) 코드. */
export const NOT_RETRYABLE_FAILURES: readonly AiFailureKind[] = [
  'auth',
  'configuration',
  'output-truncated',
  'lease-lost',
];
/** 같은 입력과 설정으로는 결과가 바뀌지 않아 자동 재시도하지 않는 실패. */
export const NON_RETRYABLE_SESSION_FAILURES: readonly AiFailureKind[] = ['output-truncated'];

export function isAiFailureKind(value: unknown): value is AiFailureKind {
  return typeof value === 'string' && (failureKinds as readonly string[]).includes(value);
}
