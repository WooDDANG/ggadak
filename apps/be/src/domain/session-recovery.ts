import { NON_RETRYABLE_SESSION_FAILURES, type AiFailureKind } from './ai-call.js';
import { hash } from './analysis-identity.js';

/** 건너뛴 세션의 복구 상태. Running·Expired는 저장 값이 아니라 조회 시점에 계산한다. */
export const RecoveryState = {
  Scheduled: 'scheduled',
  Running: 'running',
  Recovered: 'recovered',
  Exhausted: 'exhausted',
  Expired: 'expired',
} as const;
export type RecoveryState = (typeof RecoveryState)[keyof typeof RecoveryState];

export interface SessionRecoveryKey {
  requestId: string;
  sessionId: string;
}
/** 복구를 실행 중인 소유자. 발행 트랜잭션이 이 소유권으로 복구 완료를 확정한다. */
export interface RecoveryOwner extends SessionRecoveryKey {
  owner: string;
}
export interface SessionRecoveryRecord extends SessionRecoveryKey {
  guildId: string;
  attempts: number;
  state: string;
  nextAttemptAt: Date;
  expiresAt: Date;
  purgedAt: Date | null;
  failureKind: string | null;
  owner: string | null;
  leaseUntil: Date | null;
}
/** 발행 트랜잭션이 만들 새 복구 기록. 보관 기한은 요청 생성 시점에 정책을 더해 저장소가 정한다. */
export interface NewSessionRecovery {
  sessionId: string;
  nextAttemptAt: Date;
  state: RecoveryState;
  failureKind: AiFailureKind;
}

/** 유효한 임대를 가진 작업자가 지금 복구를 실행하고 있는지. */
export function isRecoveryRunning(
  recovery: Pick<SessionRecoveryRecord, 'owner' | 'leaseUntil'>,
  now: number,
): boolean {
  return Boolean(recovery.owner) && (recovery.leaseUntil?.getTime() ?? 0) > now;
}

/** 저장된 상태에 만료와 실행 중 여부를 반영해 보여 줄 상태를 정한다. */
export function effectiveRecoveryState(
  recovery: Pick<SessionRecoveryRecord, 'state' | 'expiresAt' | 'owner' | 'leaseUntil'>,
  now: number,
): string {
  if (recovery.state === RecoveryState.Recovered) return recovery.state;
  if (recovery.expiresAt.getTime() <= now) return RecoveryState.Expired;
  if (isRecoveryRunning(recovery, now)) return RecoveryState.Running;
  return recovery.state;
}

/** 건너뛴 세션의 첫 복구 기록. 잘린 응답처럼 같은 입력으로 결과가 같은 실패는 수동 재분석만 남긴다. */
export function initialRecovery(
  session: { sessionId: string; failedAt: string; kind: AiFailureKind },
  firstRetryDelayMs: number,
): NewSessionRecovery {
  return {
    sessionId: session.sessionId,
    nextAttemptAt: new Date(Date.parse(session.failedAt) + firstRetryDelayMs),
    state: NON_RETRYABLE_SESSION_FAILURES.includes(session.kind)
      ? RecoveryState.Exhausted
      : RecoveryState.Scheduled,
    failureKind: session.kind,
  };
}

/** 복구 시도마다 쓰는 Analysis Request ID. 같은 시도는 같은 ID로 재개된다. */
export function recoveryRequestId(key: SessionRecoveryKey, attempt: number): string {
  return 'recovery-' + hash({ requestId: key.requestId, sessionId: key.sessionId, attempt });
}
