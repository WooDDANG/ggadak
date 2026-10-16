import {
  AnalysisPolicy,
  CategoryTag,
  Decision,
  DecisionSchema,
  DecisionState,
  DeliveryErrorCategory,
  GraphEdgeType,
  GraphNodeType,
  humanReactionCount,
  includesValue,
} from '@ggaddak/shared';

import crypto from 'node:crypto';
import { Inject, Service } from 'typedi';

import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type {
  AnalysisWorkflow,
  AnalysisSession,
  AnalysisStatus,
} from '../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AnalyzeDiscussionRequestDtoSchema } from '../dto/discussion.dto.js';
import { AppError, BadRequestError, NotFoundError, ConflictError } from '../errors/AppError.js';
import { AuthError } from '../errors/AuthError.js';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { AiAdapter, IAiAdapter } from '../adapters/ai.adapter.js';
import { GRAPH_PROMPT_VERSION } from '../extractor/graph-prompt.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import {
  AnalysisRequestRepository,
  CandidateDraft,
  hash,
  stableJson,
} from '../repositories/analysis-request.repository.js';
import { GraphWorkflow } from './graph-workflow.js';
import { prepareAnalysis } from './discussion-preprocessing.js';
import { AnalysisExecutionRepository } from '../repositories/analysis-execution.repository.js';

@Service()
export class DiscussionService {
  constructor(
    private repo: DecisionRepository,
    @Inject(() => AiAdapter) private extractor: IAiAdapter,
    private core: DecisionExtractorCore,
  ) {}

  async analyzeDiscussion(params: AnalyzeDiscussionParams): Promise<AnalyzeDiscussionResult> {
    const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(params);
    if (!parsed.success)
      throw new BadRequestError('Invalid discussion payload', parsed.error.flatten());
    params = parsed.data;
    const requests = new AnalysisRequestRepository(this.repo);
    const claim = await requests.claim(params);
    if (claim.result) return claim.result;
    const execution = new AnalysisExecutionRepository(this.repo.prisma);
    let slot: { slot: string; owner: string };
    try {
      slot = await execution.acquire(params.requestId, params.channelId ?? 'channel');
    } catch (error) {
      await requests.release(params.requestId, claim.owner);
      throw error;
    }
    const stored = await requests.get(params.requestId);
    const workflow: AnalysisWorkflow = stored?.workflowJson
      ? JSON.parse(stored.workflowJson)
      : this.prepare(params);
    const controller = new AbortController();
    const heartbeat = setInterval(() => {
      void Promise.all([
        requests.renew(params.requestId, claim.owner),
        execution.renew(slot),
      ]).catch(error => controller.abort(error));
    }, AnalysisPolicy.leaseHeartbeatMs);
    heartbeat.unref();
    const save = async () => {
      await execution.renew(slot);
      await requests.checkpoint(params.requestId, claim.owner, workflow, params);
    };
    try {
      await save();
      const algorithm = new GraphWorkflow(this.extractor);
      for (const session of workflow.sessions)
        await algorithm.run(session, workflow, save, controller.signal, claim.owner);
      const drafts: CandidateDraft[] = [];
      for (const session of workflow.sessions) drafts.push(...this.project(session, params));
      await save();
      if (controller.signal.aborted) throw new AppError('Analysis ownership lost', 503);
      const snapshot: GraphSnapshot = {
        id: 'graph-' + params.requestId,
        schemaVersion: 1,
        requestId: params.requestId,
        guildId: params.guildId ?? 'discord',
        sessions: workflow.sessions.map(session => session.graph!),
      };
      return await requests.complete(
        params,
        claim.owner,
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
    } catch (error) {
      const status =
        error instanceof AppError
          ? error.statusCode
          : ((error as { status?: number }).status ?? 500);
      const retryable = status >= 500 || status === 429 || status === 408;
      await requests.fail(params.requestId, claim.owner, {
        category: status === 422 ? 'validation-or-budget' : DeliveryErrorCategory.ProviderOrStorage,
        message:
          status === 422
            ? 'Analysis requires a new manual reanalysis'
            : 'Analysis temporarily unavailable',
        status,
        retryable,
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
      await execution.release(slot);
    }
  }

  getCandidateHistory(decisionId: string) {
    return new AnalysisRequestRepository(this.repo).history(decisionId);
  }

  private async scoped(requestId: string, guildId: string) {
    const row = await new AnalysisRequestRepository(this.repo).get(requestId);
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
          logicalCalls: s.calls.length,
          attempts: s.attempts.length,
          inputTokens: s.attempts.reduce((n, a) => n + (a.inputTokens ?? 0), 0),
          outputTokens: s.attempts.reduce((n, a) => n + (a.outputTokens ?? 0), 0),
        })) ?? [],
    };
  }

  async getGraph(requestId: string, guildId: string): Promise<GraphSnapshot> {
    const row = await this.scoped(requestId, guildId);
    if (row.state === 'terminal') throw new AppError('Analysis failed validation', 422);
    if (row.state !== 'completed') throw new ConflictError('Analysis not completed');
    if (!row.graphJson) throw new NotFoundError('Graph unavailable for this legacy analysis');
    const snapshot: GraphSnapshot = JSON.parse(row.graphJson);
    for (const node of snapshot.sessions.flatMap(s => s.nodes)) {
      if (node.decisionId) {
        const current = await this.repo.getDecisionById(node.decisionId);
        if (current) {
          node.currentDecisionVersion = current.version ?? 1;
          node.stale = node.currentDecisionVersion !== node.decisionVersion;
        }
      }
    }
    return snapshot;
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

  private project(session: AnalysisSession, params: AnalyzeDiscussionParams): CandidateDraft[] {
    const graph = session.graph!;
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const evidenceMessages = session.messages.map(m => ({
      id: m.id,
      author: m.author,
      content: m.content,
      ...(m.createdAt ? { createdAt: m.createdAt } : {}),
      ...(m.replyingTo ? { replyingTo: m.replyingTo } : {}),
    }));
    const evidenceJson = stableJson({
      guildId: params.guildId ?? 'discord',
      channelId: params.channelId ?? 'channel',
      messages: evidenceMessages,
    });
    const evidenceHash = hash(JSON.parse(evidenceJson));
    const legacyHash = crypto
      .createHash('sha256')
      .update(session.messages.map(m => m.id).join('|'))
      .digest('hex');
    const participants = [...new Set(session.messages.map(m => m.author))];
    return graph.nodes
      .filter(n => n.type === GraphNodeType.DecisionCandidate)
      .map(node => {
        const related = (type: string) =>
          graph.edges
            .filter(e => e.type === type && e.sourceId === node.id)
            .map(e => byId.get(e.targetId)!);
        const alternatives = related(GraphEdgeType.HasAlternative);
        const targets = new Set([node.id, ...alternatives.map(n => n.id)]);
        const reasons = graph.edges
          .filter(
            e =>
              includesValue([GraphEdgeType.Supports, GraphEdgeType.Opposes], e.type) &&
              targets.has(e.targetId),
          )
          .map(e => byId.get(e.sourceId)!.summary);
        const rationale = [...new Set(reasons)].join('\n');
        const parents = graph.edges
          .filter(e => e.type === GraphEdgeType.Contains && e.targetId === node.id)
          .map(e => byId.get(e.sourceId)!);
        const topic =
          parents.find(n => n.type === GraphNodeType.Topic) ??
          graph.edges
            .filter(
              e => e.type === GraphEdgeType.Contains && parents.some(p => p.id === e.targetId),
            )
            .map(e => byId.get(e.sourceId)!)
            .find(n => n.type === GraphNodeType.Topic);
        const actionItems = related(GraphEdgeType.Triggers).map(n => ({
          id: n.id,
          task: n.summary,
          ...(n.assignee ? { assignee: n.assignee } : {}),
          ...(n.dueDate ? { dueDate: n.dueDate } : {}),
        }));
        const governance = this.core.calculateGovernanceScore({
          participantCount: participants.length,
          reactionsCount: session.messages.reduce((n, m) => n + humanReactionCount(m), 0),
          rationale,
          actionItemsCount: actionItems.length,
          hasExternalFeedback: false,
        });
        const decisionId = (session.idMap['decision:' + node.id] ??= 'DEC-' + crypto.randomUUID());
        const decision: Decision = DecisionSchema.parse({
          id: decisionId,
          topic: topic?.summary ?? parents[0]?.summary ?? node.summary,
          title: node.summary,
          decision: node.summary,
          decisionContent: node.summary,
          rationale,
          rationaleStatus: node.rationaleStatus,
          observation: node.observation,
          alternatives: alternatives.map(n => ({
            id: n.id,
            option: n.summary,
            reason: graph.edges
              .filter(e => e.type === GraphEdgeType.Opposes && e.targetId === n.id)
              .map(e => byId.get(e.sourceId)!.summary)
              .join('\n'),
          })),
          actionItems,
          categoryTag: node.category ?? CategoryTag.Other,
          state: DecisionState.Draft,
          supersedesId: null,
          isPivot: false,
          approvedBy: null,
          decisionConfirmedDate: null,
          rawEvidence: session.messages.map(m => m.id),
          evidenceHash,
          rawTranscript: session.transcript,
          source: {
            guildId: params.guildId ?? 'discord',
            channelId: params.channelId ?? 'channel',
            channelName: params.channelName,
            triggerMessageId: params.triggerMessageId ?? session.messages[0].id,
            messageUrl: params.messageUrl,
            participants,
            rawMessages: evidenceMessages,
          },
          createdAt: new Date().toISOString(),
          governanceScore: governance.score,
          governanceReason: governance.reason,
          governancePassed: governance.score >= 3,
        });
        return { decision, evidenceJson, legacyHash, graphNodeId: node.id };
      });
  }
}
