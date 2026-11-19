import { GraphEdgeType } from '@ggaddak/shared';
import { Inject, Service } from 'typedi';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type { AnalysisWorkflow, AnalysisSession } from '../domain/analysis-workflow.js';
import type { CandidateDraft } from '../domain/candidate-publication.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import type { ScanRangeDto } from '../dto/analysis-queue.dto.js';
import { AnalyzeDiscussionRequestDtoSchema } from '../dto/discussion.dto.js';
import { AppError, BadRequestError } from '../errors/AppError.js';
import { SESSION_SCOPED_FAILURES, explicitFailureKind } from '../errors/ai-diagnostics.js';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter, IAiAdapter } from '../adapters/ai.adapter.js';
import { GRAPH_PROMPT_VERSION } from '../extractor/graph-prompt.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';
import { GraphWorkflow } from './graph-workflow.js';
import { AiCallScheduler, concurrencySetting } from './ai-call-scheduler.js';
import { prepareAnalysis } from './discussion-preprocessing.js';
import { AnalysisExecutionRepository } from '../repositories/analysis-execution.repository.js';
import { AnalysisRunner } from './analysis-runner.js';
import { AnalysisQueryService } from './analysis-query.service.js';
import { projectCandidates } from './candidate-projection.js';
import { CandidatePublicationService } from './candidate-publication.service.js';
import {
  CandidatePublicationRepository,
  type RecoveryOwner,
} from '../repositories/candidate-publication.repository.js';

@Service()
export class DiscussionService {
  private readonly queries: AnalysisQueryService;
  constructor(
    private repo: DecisionRepository,
    @Inject(() => AiAdapter) private extractor: IAiAdapter,
    private core: DecisionExtractorCore,
    private scheduler: AiCallScheduler = new AiCallScheduler(repo.prisma),
  ) {
    this.queries = new AnalysisQueryService(repo);
  }

  async analyzeDiscussion(
    params: AnalyzeDiscussionParams,
    options: {
      signal?: AbortSignal;
      scanRange?: ScanRangeDto;
      initialWorkflow?: AnalysisWorkflow;
      recovery?: RecoveryOwner;
    } = {},
  ): Promise<AnalyzeDiscussionResult> {
    if (options.signal?.aborted)
      throw new AppError('Analysis cancelled', 503, { failureKind: 'lease-lost' });
    const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(params);
    if (!parsed.success)
      throw new BadRequestError('Invalid discussion payload', parsed.error.flatten());
    params = parsed.data;
    const sessionWorkers = concurrencySetting('AI_SESSION_CONCURRENCY');
    const requests = new AnalysisRequestRepository(this.repo);
    const runner = new AnalysisRunner(requests, new AnalysisExecutionRepository(this.repo.prisma));
    return runner.run(
      params,
      async (owner, signal, assertExecutionOwner) => {
        const stored = await requests.get(params.requestId);
        const workflow: AnalysisWorkflow = stored?.workflowJson
          ? JSON.parse(stored.workflowJson)
          : (options.initialWorkflow ?? this.prepare(params));
        let checkpoints = Promise.resolve();
        const save = (session?: AnalysisSession) => {
          const snapshot = session ? structuredClone(session) : undefined;
          const task = checkpoints.then(async () => {
            await assertExecutionOwner();
            await requests.checkpoint(params.requestId, owner, workflow, params, snapshot);
          });
          checkpoints = task.catch(() => {});
          return task;
        };
        await save();
        const siblings = new AbortController();
        const workerSignal = AbortSignal.any([signal, siblings.signal]);
        const algorithm = new GraphWorkflow(this.extractor, this.scheduler);
        let cursor = 0;
        let failed = false;
        let failure: unknown;
        await Promise.all(
          Array.from({ length: Math.min(sessionWorkers, workflow.sessions.length) }, async () => {
            while (!workerSignal.aborted && cursor < workflow.sessions.length) {
              const session = workflow.sessions[cursor++];
              if (session.skippedFailure) continue;
              try {
                await algorithm.run(session, workflow, save, workerSignal, owner, {
                  requestId: params.requestId,
                  traceId: params.traceId,
                  guildId: params.guildId,
                  channelId: params.channelId,
                });
              } catch (error) {
                const kind = explicitFailureKind(error);
                // 세션에 국한된 실패만 건너뛴다. 소유권 상실은 실패가 아니므로 건너뛰지 않는다.
                if (
                  options.scanRange &&
                  !workerSignal.aborted &&
                  kind &&
                  SESSION_SCOPED_FAILURES.includes(kind)
                ) {
                  session.skippedFailure = {
                    sessionId: session.id,
                    messageIds: session.messages.map(message => message.id),
                    failedAt: new Date().toISOString(),
                    kind,
                    scanRange: options.scanRange,
                  };
                  try {
                    await save(session);
                    continue;
                  } catch (checkpointError) {
                    error = checkpointError;
                  }
                }
                if (!failed) {
                  failed = true;
                  failure = error;
                }
                siblings.abort(error);
              }
            }
          }),
        );
        await checkpoints;
        if (failed) throw failure;
        if (signal.aborted)
          throw new AppError('Analysis ownership lost', 503, { failureKind: 'lease-lost' });
        const drafts: CandidateDraft[] = [];
        const successful = workflow.sessions.filter(session => !session.skippedFailure);
        const skippedSessions = workflow.sessions.flatMap(session =>
          session.skippedFailure ? [session.skippedFailure] : [],
        );
        for (const session of successful)
          drafts.push(...projectCandidates(session, params, this.core));
        await save();
        if (signal.aborted)
          throw new AppError('Analysis ownership lost', 503, { failureKind: 'lease-lost' });
        const snapshot: GraphSnapshot = {
          id: 'graph-' + params.requestId,
          schemaVersion: 1,
          requestId: params.requestId,
          guildId: params.guildId ?? 'discord',
          sessions: successful.map(session => session.graph!),
        };
        return await new CandidatePublicationService(
          new CandidatePublicationRepository(this.repo),
        ).publish(
          params,
          owner,
          {
            found: drafts.length > 0,
            summary: skippedSessions.length
              ? `검증에 실패한 세션 ${skippedSessions.length}개를 건너뛰었습니다.`
              : workflow.skipped
                ? 'Discussion skipped by deterministic noise rules'
                : successful.map(s => s.graph!.summary).join(' / ') || 'No candidates',
            ...(skippedSessions.length ? { skippedSessions } : {}),
            damagedSessionCount: successful.filter(session => session.graph?.damage?.length).length,
            decisions: drafts.map(d => d.decision),
            requestId: params.requestId,
            graphId: snapshot.id,
            graphAvailable: true,
            hasConflict: snapshot.sessions.some(
              s =>
                s.discussionProblems.length > 0 ||
                s.edges.some(e => e.type === GraphEdgeType.ConflictsWith),
            ),
          },
          drafts,
          snapshot,
          options.recovery,
        );
      },
      options.signal,
    );
  }

  getCandidateHistory(decisionId: string) {
    return this.queries.getCandidateHistory(decisionId);
  }

  getStatus(requestId: string, guildId: string) {
    return this.queries.getStatus(requestId, guildId);
  }

  getGraph(requestId: string, guildId: string) {
    return this.queries.getGraph(requestId, guildId);
  }

  private prepare(params: AnalyzeDiscussionParams): AnalysisWorkflow {
    return prepareAnalysis(
      params,
      this.extractor.settings ?? {
        provider: 'fixture',
        model: 'fixture',
        promptVersion: GRAPH_PROMPT_VERSION,
        maxOutputTokens: 8192,
        maxInputChars: 100000,
      },
      this.core,
    );
  }
}
