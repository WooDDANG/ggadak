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
  type DecisionGraph,
} from '../domain/decision-graph.js';
import { AppError } from '../errors/AppError.js';
import {
  boundedProviderResponse,
  classifyAiFailure,
  providerResponseFrom,
  safeAiErrorCode,
} from '../errors/ai-diagnostics.js';
import { createLogger } from '@ggaddak/shared';
import type { AiCallScheduler } from './ai-call-scheduler.js';
import { modelForStage } from '../domain/ai-call.js';

const logger = createLogger('BE-GRAPH-WORKFLOW');

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
    owner?: string,
    identity?: { requestId: string; traceId?: string; guildId?: string; channelId?: string },
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
      if (signal.aborted) throw new AppError('Analysis ownership lost', 503);
      if (session.elapsedMs >= GraphPolicy.sessionBudgetMs)
        throw new AppError('Analysis time budget exhausted', 422);
      if (includesValue([AnalysisPhase.Check, AnalysisPhase.Recheck], session.phase)) {
        const checkStarted = Date.now();
        const checked = GraphSchema.safeParse(session.value);
        const normalized = checked.success ? normalizeGraph(checked.data) : undefined;
        const issues = checked.success
          ? graphIssues(normalized!)
          : checked.error.issues.map(
              issue =>
                `${issue.path.join('.')}: ${issue.message}${issue.code === 'invalid_enum_value' ? `; allowed=${issue.options.join('|')}` : ''}`,
            );
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
                code: issue.code,
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
            graphData: boundedProviderResponse(session.value),
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
          session.value = normalized ?? session.value;
          session.phase = session.repairs ? AnalysisPhase.Reverify : AnalysisPhase.Verify;
        }
        session.elapsedMs += Math.max(0, Date.now() - checkStarted);
        await save(session);
        continue;
      }
      const permit = await this.scheduler.acquire(signal);
      session.waitMs = (session.waitMs ?? 0) + permit.waitMs;
      let prepared: IAiAdapter | undefined;
      try {
        const callSignal = permit.signal;
        if (callSignal.aborted) throw new AppError('Analysis cancelled before AI call', 503);
        // 계정 예산 대기는 논리 호출·시도·실행 시간 예산을 소비하지 않는다.
        const ai = (await this.ai.prepareCall?.(callSignal)) ?? this.ai;
        prepared = ai;
        const phase = session.phase;
        if (!session.calls.includes(phase)) {
          session.calls.push(phase);
        }
        if (
          session.calls.length > GraphPolicy.maxLogicalCalls ||
          session.repairs > GraphPolicy.maxRepairs
        )
          throw new AppError('Analysis call budget exhausted', 422);
        const timeoutMs = Math.min(
          GraphPolicy.callTimeoutMs,
          GraphPolicy.sessionBudgetMs - session.elapsedMs,
        );
        const startedAt = Date.now();
        const attempt: StageAttempt = {
          callId: randomUUID(),
          phase,
          waitMs: permit.waitMs,
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
        const abort = () => controller.abort(callSignal.reason);
        callSignal.addEventListener('abort', abort, { once: true });
        if (callSignal.aborted) abort();
        let timer: ReturnType<typeof setTimeout> | undefined;
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
                  new AppError(signal.aborted ? 'Analysis ownership lost' : 'AI call timeout', 503),
                ),
              { once: true },
            );
            if (controller.signal.aborted) reject(new AppError('Analysis ownership lost', 503));
            timer = setTimeout(() => controller.abort(), timeoutMs);
          });
          const result: AiResult = await Promise.race([operation, interrupted]);
          if (signal.aborted) throw new AppError('Analysis ownership lost', 503);
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
            if (!verified.success) throw new AppError('Invalid AI verification response', 422);
            if (!verified.data.valid) {
              if ((session.repairBudgets?.semantic ?? (session.repairs ? 1 : 0)) >= 1)
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
        } catch (error) {
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
            providerResponse: providerResponseFrom(error),
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
        if (session.elapsedMs >= GraphPolicy.sessionBudgetMs)
          throw new AppError('Analysis time budget exhausted', 422);
      } finally {
        try {
          await prepared?.releaseCall?.();
        } finally {
          await permit.release();
        }
      }
    }
  }

  private requestRepair(
    session: AnalysisSession,
    feedback: string[],
    failureKind: 'graph-structure' | 'semantic-verification' = 'semantic-verification',
  ): void {
    session.feedback = feedback;
    const budgets = (session.repairBudgets ??= session.repairs
      ? { structure: 1, semantic: 1 }
      : { structure: 0, semantic: 0 });
    const key = failureKind === 'graph-structure' ? 'structure' : 'semantic';
    if (budgets[key] >= 1)
      throw new AppError('Analysis validation failed after repair', 422, { failureKind });
    budgets[key]++;
    session.repairs++;
    if (session.calls.includes(AnalysisPhase.Repair)) session.calls.push(AnalysisPhase.Repair);
    session.phase = AnalysisPhase.Repair;
  }

  private link(graph: DecisionGraph, session: AnalysisSession) {
    const id = (temporary: string) => (session.idMap[temporary] ??= randomUUID());
    return {
      ...graph,
      sessionId: session.id,
      inputMessageIds: session.messages.map(m => m.id),
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
