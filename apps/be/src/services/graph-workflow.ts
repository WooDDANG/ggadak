import { includesValue } from '@ggaddak/shared';
import { AnalysisPhase } from '../domain/analysis-workflow.js';
import { GraphPolicy } from '../config/policies.js';
import { randomUUID } from 'node:crypto';
import type { IAiAdapter } from '../domain/ai-analysis.js';
import type { AiResult } from '../domain/ai-call.js';
import type {
  AnalysisWorkflow,
  AnalysisSession,
  StageAttempt,
} from '../domain/analysis-workflow.js';
import {
  GraphSchema,
  VerificationSchema,
  graphIssues,
  normalizeGraph,
  removeInvalidEdges,
  type DecisionGraph,
} from '../domain/decision-graph.js';
import { AppError } from '../errors/AppError.js';
import { AnalysisBusyError } from '../errors/analysis-error.js';
import { setTimeout as delay } from 'node:timers/promises';
import {
  classifyAiFailure,
  providerResponseFrom,
  safeAiErrorCode,
} from '../errors/ai-diagnostics.js';
import { createLogger } from '@ggaddak/shared';
import type { AiCallScheduler } from './ai-call-scheduler.js';
import { recordVerificationMetric } from '../adapters/ai-metrics-logger.js';
import { LEASE_LOST, modelForStage } from '../domain/ai-call.js';
import config from '../config/index.js';

const logger = createLogger('BE-GRAPH-WORKFLOW');

const ownershipLost = (message = 'Analysis ownership lost') =>
  new AppError(message, 503, { failureKind: 'lease-lost' });
/** AI_CALL_TIMEOUT_MS가 양수가 아니면 정책 기본값을 쓴다. */
const callTimeoutMs = () => {
  const configured = config.ai.callTimeoutMs;
  return configured !== undefined && Number.isFinite(configured) && configured > 0
    ? configured
    : GraphPolicy.callTimeoutMs;
};
// 세션 시간 예산 소진은 호출 타임아웃과 같은 세션 단위 실패다(ADR-0028).
const timeBudgetExhausted = () =>
  new AppError('Analysis time budget exhausted', 422, { failureKind: 'timeout' });

/** Bounded session algorithm; checkpoint callback owns persistence and owner fencing. */
export class GraphWorkflow {
  constructor(
    private readonly ai: IAiAdapter,
    private readonly scheduler: AiCallScheduler,
  ) {}

  async run(
    session: AnalysisSession,
    workflow: AnalysisWorkflow,
    save: (session?: AnalysisSession) => Promise<void>,
    signal: AbortSignal,
    owner: string | undefined,
    identity: { requestId: string; traceId?: string; guildId?: string; channelId?: string },
  ): Promise<void> {
    if (session.active !== undefined) {
      const interrupted = session.attempts[session.active];
      interrupted.endedAt = Date.now();
      interrupted.outcome = 'interrupted';
      interrupted.error = { message: 'Previous attempt was interrupted', status: 503 };
      session.elapsedMs += Math.min(
        interrupted.timeoutMs,
        Math.max(0, Date.now() - interrupted.startedAt),
      );
      delete session.active;
      await save(session);
    }
    while (session.phase !== AnalysisPhase.Done) {
      if (signal.aborted) throw ownershipLost();
      if (session.elapsedMs >= GraphPolicy.sessionBudgetMs) throw timeBudgetExhausted();
      if (includesValue([AnalysisPhase.Check, AnalysisPhase.Recheck], session.phase)) {
        const checkStarted = Date.now();
        const checked = GraphSchema.safeParse(session.value);
        let issues: string[];
        if (checked.success) {
          const cleaned = removeInvalidEdges(checked.data, identity.requestId, session.id);
          if (cleaned.damage.length) (session.damage ??= []).push(...cleaned.damage);
          const normalized = normalizeGraph(cleaned.graph);
          session.value = normalized;
          issues = graphIssues(normalized);
          if (issues.some(issue => issue.startsWith('Unlinked node:')))
            issues.push(
              ...graphIssues(checked.data).filter(issue => issue.startsWith('Invalid endpoints:')),
            );
        } else {
          issues = checked.error.issues.map(
            issue =>
              `${issue.path.join('.')}: ${issue.message}${issue.code === 'invalid_enum_value' ? `; allowed=${issue.options.join('|')}` : ''}`,
          );
        }
        if (issues.length) {
          // 오류 위치에는 모델이 생성한 임의 필드명을 포함하지 않는다.
          const allowedFields = new Set([
            'summary',
            'nodes',
            'edges',
            'discussionProblems',
            'id',
            'type',
            'observation',
            'rationaleStatus',
            'category',
            'history',
            'at',
            'assignee',
            'dueDate',
            'sourceId',
            'targetId',
            'nodeIds',
            'edgeIds',
          ]);
          const issueDetails = checked.success
            ? issues.slice(0, 20).map(issue => ({
                code:
                  (
                    {
                      'Invalid endpoints': 'invalid-endpoints',
                      'Inconsistent rationale status': 'rationale-status',
                      'Incomplete candidate': 'incomplete-candidate',
                      'Duplicate node ID': 'duplicate-node',
                      'Duplicate edge ID': 'duplicate-edge',
                      'Duplicate relation': 'duplicate-relation',
                      'Unlinked node': 'unlinked-node',
                      'Invalid problem references': 'invalid-problem-references',
                    } as Record<string, string>
                  )[issue.split(':', 1)[0]] ?? 'other',
              }))
            : checked.error.issues.slice(0, 20).map(issue => ({
                code: issue.code === 'invalid_enum_value' ? 'enum-mismatch' : issue.code,
                path: issue.path
                  .map(part =>
                    typeof part === 'number' ? '*' : allowedFields.has(part) ? part : '<other>',
                  )
                  .join('.'),
              }));
          logger.warn('analysis.validation.issues', {
            ...identity,
            callId: session.attempts.at(-1)?.callId,
            failureStage: session.phase,
            validationType: checked.success ? 'graph_relations' : 'schema',
            issuesCount: issues.length,
            issueDetails,
            truncated: issues.length > issueDetails.length,
          });
          try {
            this.requestRepair(session, issues, 'graph-structure');
          } catch (error) {
            logger.warn('analysis.validation.failed', {
              ...identity,
              callId: session.attempts.at(-1)?.callId,
              failureStage: session.phase,
              failureKind: 'graph-structure',
              errorSummary: 'AI graph structure was invalid',
              issuesCount: issues.length,
              issueDetails,
              status: 422,
              retryable: false,
            });
            await save(session);
            throw error;
          }
        } else {
          session.phase =
            session.calls.includes(AnalysisPhase.Verify) ||
            session.calls.includes(AnalysisPhase.Reverify)
              ? AnalysisPhase.Reverify
              : AnalysisPhase.Verify;
        }
        session.elapsedMs += Math.max(0, Date.now() - checkStarted);
        await save(session);
        continue;
      }
      // 예산을 넘길 호출은 AI 슬롯·키·분당 호출 수를 예약하기 전에 거절한다.
      const phase = session.phase;
      if (!session.calls.includes(phase)) session.calls.push(phase);
      if (
        session.calls.length > GraphPolicy.maxLogicalCalls ||
        session.repairs > GraphPolicy.maxRepairs
      )
        throw new AppError('Analysis call budget exhausted', 422, {
          failureKind: 'budget-exhausted',
        });
      const permit = await this.scheduler.acquire(signal);
      session.waitMs = (session.waitMs ?? 0) + permit.waitMs;
      let prepared: IAiAdapter | undefined;
      try {
        const callSignal = permit.signal;
        if (callSignal.aborted) throw ownershipLost('Analysis cancelled before AI call');
        // 계정 예산 대기는 논리 호출·시도·실행 시간 예산을 소비하지 않는다.
        const reserved = await this.reserveKey(callSignal, session);
        const ai = reserved.ai;
        prepared = ai;
        const timeoutMs = Math.min(
          callTimeoutMs(),
          GraphPolicy.sessionBudgetMs - session.elapsedMs,
        );
        const startedAt = Date.now();
        const attempt: StageAttempt = {
          callId: randomUUID(),
          phase,
          waitMs: permit.waitMs + reserved.waitMs,
          provider: workflow.settings.provider,
          model: modelForStage(
            workflow.settings,
            phase === AnalysisPhase.Extract
              ? AnalysisPhase.Extract
              : phase === AnalysisPhase.Repair
                ? AnalysisPhase.Repair
                : AnalysisPhase.Verify,
          ),
          owner,
          startedAt,
          timeoutMs,
          deadline: startedAt + timeoutMs,
        };
        session.attempts.push(attempt);
        session.active = session.attempts.length - 1;
        await save(session);
        const controller = new AbortController();
        const abort = () => controller.abort(LEASE_LOST);
        callSignal.addEventListener('abort', abort, { once: true });
        if (callSignal.aborted) abort();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        let operation: Promise<AiResult> | undefined;
        try {
          const context = {
            signal: controller.signal,
            settings: workflow.settings,
            ...identity,
            callId: attempt.callId,
            retryCount: session.attempts.filter(item => item.phase === phase).length - 1,
            issuesCount: phase === AnalysisPhase.Repair ? session.feedback.length : 0,
          };
          operation =
            phase === AnalysisPhase.Extract
              ? ai.extractGraph(session.transcript, context)
              : phase === AnalysisPhase.Repair
                ? ai.repairGraph(session.transcript, session.value, session.feedback, context)
                : ai.verifyGraph(session.transcript, session.value, context);
          const interrupted = new Promise<never>((_, reject) => {
            controller.signal.addEventListener(
              'abort',
              () =>
                reject(
                  signal.aborted || controller.signal.reason === LEASE_LOST
                    ? ownershipLost()
                    : new AppError('AI call timeout', 503, { failureKind: 'timeout' }),
                ),
              { once: true },
            );
            if (controller.signal.aborted) reject(ownershipLost());
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs);
          });
          const result: AiResult = await Promise.race([operation, interrupted]);
          if (signal.aborted) throw ownershipLost();
          Object.assign(attempt, {
            outcome: 'completed',
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
          });
          if (phase === AnalysisPhase.Extract || phase === AnalysisPhase.Repair) {
            session.value = result.value;
            session.phase =
              phase === AnalysisPhase.Extract ? AnalysisPhase.Check : AnalysisPhase.Recheck;
          } else {
            session.verification = result.value;
            attempt.verification = result.value;
            const verified = VerificationSchema.safeParse(result.value);
            recordVerificationMetric({
              requestId: identity?.requestId,
              callId: attempt.callId,
              traceId: identity?.traceId,
              stage: phase,
              outcome: verified.success ? 'valid' : 'invalid',
            });
            logger.info('analysis.verification.schema', {
              ...identity,
              callId: attempt.callId,
              failureStage: phase,
              outcome: verified.success ? 'valid' : 'invalid',
              issuesCount: verified.success ? 0 : verified.error.issues.length,
            });
            if (!verified.success) {
              logger.warn('analysis.validation.failed', {
                ...identity,
                callId: attempt.callId,
                failureStage: phase,
                failureKind: 'verify-format',
                issuesCount: verified.error.issues.length,
                issueDetails: verified.error.issues
                  .slice(0, 20)
                  .map(issue => ({ code: issue.code })),
              });
              throw new AppError('Invalid AI verification response', 422, {
                failureKind: 'verify-format',
              });
            }
            if (!verified.data.valid) {
              if (this.repairBudgets(session).semantic >= 1)
                logger.warn('analysis.validation.failed', {
                  ...identity,
                  callId: attempt.callId,
                  failureStage: phase,
                  failureKind: 'semantic-verification',
                  issuesCount: verified.data.issues.length,
                  issueDetails: [{ code: 'semantic-verification' }],
                });
              this.requestRepair(
                session,
                verified.data.issues.map(issue =>
                  [
                    issue.message,
                    issue.nodeIds.length ? `nodes: ${issue.nodeIds.join(', ')}` : '',
                    issue.edgeIds.length ? `edges: ${issue.edgeIds.join(', ')}` : '',
                  ]
                    .filter(Boolean)
                    .join(' | '),
                ),
              );
            } else {
              const graph = GraphSchema.parse(session.value);
              session.graph = this.link(graph, session);
              session.phase = AnalysisPhase.Done;
            }
          }
        } catch (caught) {
          // 워크플로가 끊은 호출은 provider가 어떤 오류를 내든 타임아웃이다.
          const error =
            timedOut && !signal.aborted
              ? new AppError('AI call timeout', 503, { failureKind: 'timeout' })
              : caught;
          const diagnostic = classifyAiFailure(error, phase);
          attempt.outcome = 'failed';
          attempt.error = {
            message: error instanceof Error ? error.message : 'Analysis stage failed',
            status: diagnostic.status,
            failureKind: diagnostic.failureKind,
            retryable: diagnostic.retryable,
            providerResponse: providerResponseFrom(error),
          };
          logger.warn('analysis.attempt.failed', {
            ...identity,
            callId: attempt.callId,
            failureStage: phase,
            errorCode: safeAiErrorCode(error),
            durationMs: Math.max(0, Date.now() - attempt.startedAt),
            ...diagnostic,
          });
          throw error;
        } finally {
          controller.abort();
          await operation?.catch(() => {});
          if (timer) clearTimeout(timer);
          callSignal.removeEventListener('abort', abort);
          const elapsed = Math.max(0, Date.now() - attempt.startedAt);
          session.elapsedMs += elapsed;
          Object.assign(attempt, { endedAt: Date.now() });
          delete session.active;
          await save(session);
        }
        if (session.elapsedMs >= GraphPolicy.sessionBudgetMs) throw timeBudgetExhausted();
      } finally {
        try {
          await prepared?.releaseCall?.();
        } finally {
          await permit.release();
        }
      }
    }
  }

  /**
   * 호출 차례를 쥔 채 빈 키를 예약한다. 빈 키가 잠깐 없으면 형제 세션까지 멈추는 요청 실패로
   * 올리지 않고 기다렸다 다시 예약한다. 기다린 시간은 세션 대기 시간에만 더한다.
   * 기다릴 시간이 정책 상한을 넘으면 AnalysisBusyError를 그대로 던진다. 요청은 새 세션을 멈추고
   * 처리 중인 세션을 마무리한 뒤, 시도를 소모하지 않고 Analysis Queue에서 다시 실행된다.
   */
  private async reserveKey(
    signal: AbortSignal,
    session: AnalysisSession,
  ): Promise<{ ai: IAiAdapter; waitMs: number }> {
    const started = Date.now();
    const waited = () => Date.now() - started;
    try {
      for (;;) {
        try {
          return { ai: (await this.ai.prepareCall?.(signal)) ?? this.ai, waitMs: waited() };
        } catch (error) {
          if (!(error instanceof AnalysisBusyError)) throw error;
          const retryAfterMs = Math.max(1, error.retryAfterMs);
          if (waited() + retryAfterMs > GraphPolicy.maxKeyWaitMs) throw error;
          await delay(retryAfterMs, undefined, { signal }).catch(() => {
            throw ownershipLost('Analysis cancelled while waiting for an NVIDIA key');
          });
        }
      }
    } finally {
      session.waitMs = (session.waitMs ?? 0) + waited();
    }
  }

  private requestRepair(
    session: AnalysisSession,
    feedback: string[],
    failureKind: 'graph-structure' | 'semantic-verification' = 'semantic-verification',
  ): void {
    session.feedback = feedback;
    const budgets = this.repairBudgets(session);
    const key = failureKind === 'graph-structure' ? 'structure' : 'semantic';
    if (budgets[key] >= 1)
      throw new AppError('Analysis validation failed after repair', 422, { failureKind });
    budgets[key]++;
    session.repairs++;
    if (session.calls.includes(AnalysisPhase.Repair)) session.calls.push(AnalysisPhase.Repair);
    session.phase = AnalysisPhase.Repair;
  }

  private repairBudgets(session: AnalysisSession) {
    return (session.repairBudgets ??= {
      structure: session.repairs && session.calls[1] === AnalysisPhase.Repair ? 1 : 0,
      semantic: session.repairs && session.calls[1] === AnalysisPhase.Verify ? 1 : 0,
    });
  }

  private link(graph: DecisionGraph, session: AnalysisSession) {
    const id = (temporary: string) => (session.idMap[temporary] ??= randomUUID());
    return {
      ...graph,
      sessionId: session.id,
      inputMessageIds: session.messages.map(m => m.id),
      ...(session.damage?.length ? { damage: session.damage } : {}),
      nodes: graph.nodes.map(node => ({ ...node, id: id('node:' + node.id) })),
      edges: graph.edges.map(edge => ({
        ...edge,
        id: id('edge:' + edge.id),
        sourceId: id('node:' + edge.sourceId),
        targetId: id('node:' + edge.targetId),
      })),
      discussionProblems: graph.discussionProblems.map(problem => ({
        ...problem,
        nodeIds: problem.nodeIds.map(value => id('node:' + value)),
        edgeIds: problem.edgeIds.map(value => id('edge:' + value)),
      })),
    };
  }
}
