import { GraphEdgeType } from '@ggaddak/shared';
import { Inject, Service } from 'typedi';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type { AnalysisWorkflow, AnalysisSession } from '../domain/analysis-workflow.js';
import type { CandidateDraft } from '../domain/candidate-publication.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AnalyzeDiscussionRequestDtoSchema } from '../dto/discussion.dto.js';
import { AppError, BadRequestError } from '../errors/AppError.js';
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
import { CandidatePublicationRepository } from '../repositories/candidate-publication.repository.js';

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
    options: { signal?: AbortSignal } = {},
  ): Promise<AnalyzeDiscussionResult> {
    if (options.signal?.aborted) throw new AppError('Analysis cancelled', 503);
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
          : this.prepare(params);
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
              try {
                await algorithm.run(session, workflow, save, workerSignal, owner);
              } catch (error) {
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
        if (signal.aborted) throw new AppError('Analysis ownership lost', 503);
        const drafts: CandidateDraft[] = [];
        for (const session of workflow.sessions)
          drafts.push(...projectCandidates(session, params, this.core));
        await save();
        if (signal.aborted) throw new AppError('Analysis ownership lost', 503);
        const snapshot: GraphSnapshot = {
          id: 'graph-' + params.requestId,
          schemaVersion: 1,
          requestId: params.requestId,
          guildId: params.guildId ?? 'discord',
          sessions: workflow.sessions.map(session => session.graph!),
        };
        return await new CandidatePublicationService(
          new CandidatePublicationRepository(this.repo),
        ).publish(
          params,
          owner,
          {
            found: drafts.length > 0,
            summary: workflow.skipped
              ? 'Discussion skipped by deterministic noise rules'
              : workflow.sessions.map(s => s.graph!.summary).join(' / ') || 'No candidates',
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
