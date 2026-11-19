import { randomUUID } from 'node:crypto';
import { AnalysisPolicy } from '@ggaddak/shared';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';
import type { AnalysisSession, AnalysisWorkflow } from '../domain/analysis-workflow.js';
import { DEFAULT_SEED, NON_RETRYABLE_SESSION_FAILURES } from '../domain/ai-call.js';
import {
  RecoveryState,
  recoveryRequestId,
  type SessionRecoveryRecord,
} from '../domain/session-recovery.js';
import { RecoveryPolicy } from '../config/policies.js';
import { classifyAnalysisError } from '../errors/analysis-error.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';
import { AnalysisSessionRecoveryRepository } from '../repositories/analysis-session-recovery.repository.js';
import type { DecisionRepository } from '../repositories/decision.repository.js';
import type { DiscussionService } from './discussion.service.js';

/** 건너뛴 세션을 최초 입력으로 다시 분석하고, 보관 기한이 지난 입력을 지운다(ADR-0028). */
export class AnalysisSessionRecovery {
  private readonly recoveries: AnalysisSessionRecoveryRepository;
  private readonly requests: AnalysisRequestRepository;

  constructor(
    repo: DecisionRepository,
    private readonly discussion: DiscussionService,
    private readonly now = Date.now,
  ) {
    this.recoveries = new AnalysisSessionRecoveryRepository(repo.prisma);
    this.requests = new AnalysisRequestRepository(repo);
  }

  async expireInputs(): Promise<void> {
    // 이미 쓴 시도와 지금 시도의 요청 입력을 함께 지운다.
    await this.recoveries.purgeExpiredInputs(new Date(this.now()), recovery =>
      Array.from({ length: recovery.attempts + 1 }, (_, attempt) =>
        recoveryRequestId(recovery, attempt),
      ),
    );
  }

  async runOnce(): Promise<void> {
    const owner = randomUUID();
    const leaseUntil = () => new Date(this.now() + AnalysisPolicy.leaseMs);
    const row = await this.recoveries.claimDue(new Date(this.now()), owner, leaseUntil());
    if (!row) return;
    const lease = { requestId: row.requestId, sessionId: row.sessionId, owner };
    const controller = new AbortController();
    const expiry = setTimeout(
      () => controller.abort(),
      Math.min(2_147_483_647, Math.max(0, row.expiresAt.getTime() - this.now())),
    );
    expiry.unref();
    const heartbeat = setInterval(() => {
      void this.recoveries
        .renewLease(lease, leaseUntil())
        .then(renewed => {
          if (!renewed) controller.abort();
        })
        .catch(() => controller.abort());
    }, AnalysisPolicy.leaseHeartbeatMs);
    heartbeat.unref();
    try {
      const source = await this.requests.get(row.requestId);
      if (!source?.inputJson || !source.workflowJson) {
        await this.recoveries.finish(lease, { state: RecoveryState.Exhausted });
        return;
      }
      const params: AnalyzeDiscussionParams = JSON.parse(source.inputJson);
      const original: AnalysisWorkflow = JSON.parse(source.workflowJson);
      const session = original.sessions.find(item => item.id === row.sessionId);
      if (!session?.messages.length) throw new Error('복구 세션의 원본 입력이 없습니다.');
      const requestId = recoveryRequestId(row, row.attempts);
      const fresh: AnalysisSession = {
        id: requestId + ':0',
        messages: session.messages,
        transcript: session.transcript,
        phase: 'extract',
        feedback: [],
        repairs: 0,
        elapsedMs: 0,
        calls: [],
        attempts: [],
        idMap: {},
      };
      await this.discussion.analyzeDiscussion(
        { ...params, requestId, rawMessages: fresh.messages, isManualOverride: false },
        {
          signal: controller.signal,
          initialWorkflow: {
            ...original,
            // 같은 seed면 같은 깨진 출력이 반복되기 쉽다. 시도 번호마다 바꾸되 재현 가능하게 둔다.
            settings: { ...original.settings, seed: DEFAULT_SEED + row.attempts + 1 },
            sessions: [fresh],
            skipped: false,
          },
          recovery: lease,
        },
      );
      await this.recoveries.finish(lease, { state: RecoveryState.Recovered });
    } catch (error) {
      await this.recoveries.finish(lease, this.afterFailure(row, error, controller.signal));
    } finally {
      clearTimeout(expiry);
      clearInterval(heartbeat);
      await this.recoveries.release(lease);
    }
  }

  /** 실패한 복구 시도의 다음 상태: 다시 예약하거나 수동 재분석만 남긴다. */
  private afterFailure(row: SessionRecoveryRecord, error: unknown, signal: AbortSignal) {
    const failure = classifyAnalysisError(error);
    // 용량 대기와 소유권 상실은 분석 실패가 아니므로 시도로 세지 않는다.
    const notAnAttempt = failure.busy || failure.failureKind === 'lease-lost';
    const attempts = row.attempts + (notAnAttempt ? 0 : 1);
    const delay = Math.max(
      failure.retryAfterMs,
      notAnAttempt ? RecoveryPolicy.busyRetryDelayMs : RecoveryPolicy.retryDelayMs,
    );
    const expired = signal.aborted && this.now() >= row.expiresAt.getTime();
    const needsConfiguration = failure.status === 401 || failure.status === 403;
    const manualOnly =
      failure.failureKind !== undefined &&
      NON_RETRYABLE_SESSION_FAILURES.includes(failure.failureKind);
    return {
      attempts,
      state:
        expired ||
        needsConfiguration ||
        manualOnly ||
        attempts >= RecoveryPolicy.maxAutomaticAttempts
          ? RecoveryState.Exhausted
          : RecoveryState.Scheduled,
      nextAttemptAt: new Date(this.now() + delay),
      ...(failure.failureKind && !notAnAttempt ? { failureKind: failure.failureKind } : {}),
    };
  }
}
