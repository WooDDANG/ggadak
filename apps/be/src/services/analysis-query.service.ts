import { AnalysisSessionRecoveryRepository } from '../repositories/analysis-session-recovery.repository.js';
import {
  RecoveryState,
  effectiveRecoveryState,
  isRecoveryRunning,
} from '../domain/session-recovery.js';
import type {
  AnalysisSession,
  AnalysisStatus,
  AnalysisWorkflow,
} from '../domain/analysis-workflow.js';
import type { StageAttempt } from '../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AppError, NotFoundError, ConflictError } from '../errors/AppError.js';
import { AuthError } from '../errors/AuthError.js';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';

function visibleFailure(
  attempt: StageAttempt,
): NonNullable<AnalysisStatus['sessions'][number]['failure']> {
  const message = attempt.error?.message ?? '';
  const kind = /timeout|timed out/i.test(message)
    ? 'timeout'
    : /provider does not match|prompt version|AI model selection|AI limits/i.test(message)
      ? 'configuration'
      : attempt.error?.status === 422
        ? 'validation'
        : 'provider';
  return {
    stage: attempt.phase,
    kind,
    action: kind === 'timeout' || kind === 'provider' ? 'retry' : 'new-analysis',
    summary: {
      timeout: 'AI 응답 시간이 초과되었습니다.',
      configuration: '저장된 분석 설정을 현재 환경에서 사용할 수 없습니다.',
      validation: 'AI 결과가 분석 검증을 통과하지 못했습니다.',
      provider: 'AI 서비스 호출에 실패했습니다.',
    }[kind],
  };
}

function sessionFailure(session: AnalysisSession) {
  if (session.phase === 'done') return undefined;
  const failed = [...session.attempts].reverse().find(attempt => attempt.outcome === 'failed');
  return failed ? visibleFailure(failed) : undefined;
}

/** Guild-scoped reads, independent of AI generation and execution leases. */
export class AnalysisQueryService {
  constructor(
    private readonly repo: DecisionRepository,
    private readonly requests = new AnalysisRequestRepository(repo),
    private readonly recoveries = new AnalysisSessionRecoveryRepository(repo.prisma),
  ) {}

  getCandidateHistory(decisionId: string) {
    return this.requests.history(decisionId);
  }

  private async scoped(requestId: string, guildId: string) {
    const row = await this.requests.get(requestId);
    if (!row) throw new NotFoundError('Analysis Request not found');
    if (row.guildId !== guildId) throw new AuthError('Analysis belongs to another guild', 403);
    return row;
  }

  async getStatus(requestId: string, guildId: string): Promise<AnalysisStatus> {
    const row = await this.scoped(requestId, guildId);
    const workflow: AnalysisWorkflow | null = row.workflowJson
      ? JSON.parse(row.workflowJson)
      : null;
    const error = row.errorJson ? JSON.parse(row.errorJson) : null;
    const recoveries = await this.recoveries.forRequest(requestId);
    const now = Date.now();
    const bySession = new Map(
      recoveries.map(recovery => [
        recovery.sessionId,
        {
          state: effectiveRecoveryState(recovery, now),
          attempts: recovery.attempts,
          nextAttemptAt: recovery.nextAttemptAt.toISOString(),
          expiresAt: recovery.expiresAt.toISOString(),
          ...(recovery.failureKind ? { failureKind: recovery.failureKind } : {}),
        },
      ]),
    );
    return {
      requestId,
      state: row.state,
      graphAvailable: Boolean(row.graphJson),
      retryable: error?.retryable ?? false,
      error,
      sessions:
        workflow?.sessions.map(s => ({
          sessionId: s.id,
          phase: s.phase,
          repairs: s.repairs,
          elapsedMs: s.elapsedMs,
          waitMs: s.waitMs ?? 0,
          logicalCalls: s.calls.length,
          attempts: s.attempts.length,
          inputTokens: s.attempts.reduce((n, a) => n + (a.inputTokens ?? 0), 0),
          outputTokens: s.attempts.reduce((n, a) => n + (a.outputTokens ?? 0), 0),
          ...(s.damage?.length ? { damageCount: s.damage.length } : {}),
          ...(s.skippedFailure ? { skippedFailure: s.skippedFailure } : {}),
          ...(bySession.has(s.id) ? { recovery: bySession.get(s.id) } : {}),
          ...(sessionFailure(s) ? { failure: sessionFailure(s) } : {}),
        })) ?? [],
    };
  }

  async scheduleRecovery(requestId: string, sessionId: string, guildId: string) {
    await this.scoped(requestId, guildId);
    const rescheduled = await this.recoveries.rescheduleExhausted(
      { requestId, sessionId },
      guildId,
      new Date(),
    );
    if (!rescheduled) throw new ConflictError('이 세션은 현재 원본으로 재분석할 수 없습니다.');
    return this.getStatus(requestId, guildId);
  }

  async expiredSessionSource(requestId: string, sessionId: string, guildId: string) {
    const row = await this.scoped(requestId, guildId);
    const recovery = await this.recoveries.get({ requestId, sessionId });
    const workflow: AnalysisWorkflow | null = row.workflowJson
      ? JSON.parse(row.workflowJson)
      : null;
    const failure = workflow?.sessions.find(session => session.id === sessionId)?.skippedFailure;
    // 원본으로 재분석할 수 없게 만료된 세션만 현재 메시지로 새 분석을 시작한다.
    // 만료 직전에 시작한 복구가 아직 실행 중이면 끝날 때까지 기다린다.
    const now = Date.now();
    if (
      !failure ||
      !recovery ||
      effectiveRecoveryState(recovery, now) !== RecoveryState.Expired ||
      isRecoveryRunning(recovery, now)
    )
      throw new ConflictError(
        '원본 입력이 만료된 세션만 현재 메시지로 새 분석을 시작할 수 있습니다.',
      );
    return { channelId: row.channelId, messageIds: failure.messageIds };
  }

  async getGraph(requestId: string, guildId: string): Promise<GraphSnapshot> {
    const row = await this.scoped(requestId, guildId);
    if (row.state === 'terminal') throw new AppError('Analysis failed validation', 422);
    if (row.state !== 'completed') throw new ConflictError('Analysis not completed');
    if (!row.graphJson) throw new NotFoundError('Graph unavailable for this legacy analysis');
    const snapshot: GraphSnapshot = JSON.parse(row.graphJson);
    const nodes = snapshot.sessions.flatMap(session => session.nodes);
    const versions = await this.repo.getDecisionVersions(
      nodes.flatMap(node => (node.decisionId ? [node.decisionId] : [])),
    );
    for (const node of nodes) {
      const version = node.decisionId ? versions.get(node.decisionId) : undefined;
      if (version !== undefined) {
        node.currentDecisionVersion = version;
        node.stale = version !== node.decisionVersion;
      }
    }
    return snapshot;
  }
}
