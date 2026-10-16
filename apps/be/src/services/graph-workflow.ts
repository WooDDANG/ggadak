import { includesValue } from '@ggaddak/shared';
import { AnalysisPhase } from '../domain/analysis-workflow.js';
import { GraphPolicy } from '../config/policies.js';
import { randomUUID } from 'node:crypto';
import type { IAiAdapter, AiResult } from '../adapters/ai.adapter.js';
import type {
  AnalysisWorkflow,
  AnalysisSession,
  StageAttempt,
} from '../domain/analysis-workflow.js';
import {
  GraphSchema,
  VerificationSchema,
  graphIssues,
  type DecisionGraph,
} from '../domain/decision-graph.js';
import { AppError } from '../errors/AppError.js';
import { modelForStage } from '../domain/ai-call.js';

/** Bounded session algorithm; checkpoint callback owns persistence and owner fencing. */
export class GraphWorkflow {
  constructor(private readonly ai: IAiAdapter) {}

  async run(
    session: AnalysisSession,
    workflow: AnalysisWorkflow,
    save: () => Promise<void>,
    signal: AbortSignal,
    owner?: string,
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
      await save();
    }
    while (session.phase !== AnalysisPhase.Done) {
      if (signal.aborted) throw new AppError('Analysis ownership lost', 503);
      if (session.elapsedMs >= GraphPolicy.sessionBudgetMs)
        throw new AppError('Analysis time budget exhausted', 422);
      if (includesValue([AnalysisPhase.Check, AnalysisPhase.Recheck], session.phase)) {
        const checkStarted = Date.now();
        const checked = GraphSchema.safeParse(session.value);
        const issues = checked.success
          ? graphIssues(checked.data)
          : checked.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
        if (issues.length) {
          try {
            this.requestRepair(session, issues);
          } catch (error) {
            await save();
            throw error;
          }
        } else {
          session.value = checked.success ? checked.data : session.value;
          session.phase = session.repairs ? AnalysisPhase.Reverify : AnalysisPhase.Verify;
        }
        session.elapsedMs += Math.max(0, Date.now() - checkStarted);
        await save();
        continue;
      }
      const phase = session.phase;
      if (!session.calls.includes(phase)) {
        session.calls.push(phase);
        if (phase === AnalysisPhase.Repair) session.repairs++;
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
        phase,
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
      await save();
      const controller = new AbortController();
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const context = { signal: controller.signal, settings: workflow.settings };
        const operation =
          phase === AnalysisPhase.Extract
            ? this.ai.extractGraph(session.transcript, context)
            : phase === AnalysisPhase.Repair
              ? this.ai.repairGraph(session.transcript, session.value, session.feedback, context)
              : this.ai.verifyGraph(session.transcript, session.value, context);
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
          if (!verified.data.valid)
            this.requestRepair(
              session,
              verified.data.issues.map(issue => issue.message),
            );
          else {
            const graph = GraphSchema.parse(session.value);
            session.graph = this.link(graph, session);
            session.phase = AnalysisPhase.Done;
          }
        }
      } catch (error) {
        attempt.outcome = 'failed';
        attempt.error = {
          message: error instanceof Error ? error.message : 'Analysis stage failed',
          status: error instanceof AppError ? error.statusCode : 500,
        };
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        const elapsed = Math.max(0, Date.now() - attempt.startedAt);
        session.elapsedMs += elapsed;
        Object.assign(attempt, { endedAt: Date.now() });
        delete session.active;
        await save();
      }
      if (session.elapsedMs >= GraphPolicy.sessionBudgetMs)
        throw new AppError('Analysis time budget exhausted', 422);
    }
  }

  private requestRepair(session: AnalysisSession, feedback: string[]): void {
    session.feedback = feedback;
    if (session.repairs || session.calls.includes(AnalysisPhase.Repair))
      throw new AppError('Analysis validation failed after repair', 422);
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
