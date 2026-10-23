import { AnalysisRequestState } from '../domain/analysis-workflow.js';
import { AnalysisPolicy, Decision, DecisionState } from '@ggaddak/shared';

import { createHash, randomUUID } from 'node:crypto';

import { DecisionRepository } from './decision.repository.js';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type {
  AnalysisWorkflow,
  AnalysisFailure,
  AnalysisSession,
} from '../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';

export class AnalysisRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Stable JSON removes object-key ordering while preserving meaningful array ordering. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
const normalizeContent = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');

export interface CandidateDraft {
  decision: Decision;
  evidenceJson: string;
  legacyHash: string;
  graphNodeId?: string;
}
export interface CandidateHistoryEntry {
  requestId: string;
  isManualOverride: boolean;
  previousRequestIds: string[];
  relatedCandidateIds: string[];
  createdAt: string;
  graphAvailable?: boolean;
  candidateNodeIds?: string[];
}

export class AnalysisRequestRepository {
  constructor(
    private repo: DecisionRepository,
    private leaseMs = AnalysisPolicy.leaseMs,
  ) {}

  async claim(
    params: AnalyzeDiscussionParams,
  ): Promise<{ owner: string; result?: AnalyzeDiscussionResult }> {
    const { traceId: _trace, requestId, ...payload } = params;
    if (!requestId?.trim()) throw new AnalysisRequestError('requestId is required', 400);
    const fingerprint = hash(payload);
    const owner = randomUUID();
    const now = new Date();
    await this.repo.prisma.analysisRequest.upsert({
      where: { id: requestId },
      update: {},
      create: {
        id: requestId,
        fingerprint,
        guildId: params.guildId ?? 'discord',
        channelId: params.channelId ?? 'channel',
        manual: Boolean(params.isManualOverride),
        state: AnalysisRequestState.Pending,
      },
    });
    const row = await this.repo.prisma.analysisRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (row.fingerprint !== fingerprint)
      throw new AnalysisRequestError('requestId was already used with different payload', 409);
    if (row.state === AnalysisRequestState.Completed)
      return { owner, result: JSON.parse(row.resultJson!) };
    if (row.state === AnalysisRequestState.Terminal) {
      const failure: AnalysisFailure = JSON.parse(row.errorJson!);
      throw new AnalysisRequestError(failure.message, failure.status);
    }
    const changed = await this.repo.prisma.analysisRequest.updateMany({
      where: {
        id: requestId,
        fingerprint,
        state: { in: [AnalysisRequestState.Pending, AnalysisRequestState.Processing] },
        OR: [{ owner: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        owner,
        state: AnalysisRequestState.Processing,
        leaseUntil: new Date(now.getTime() + this.leaseMs),
      },
    });
    if (!changed.count) {
      const current = await this.repo.prisma.analysisRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      if (current.state === AnalysisRequestState.Completed)
        return { owner, result: JSON.parse(current.resultJson!) };
      throw new AnalysisRequestError('Analysis is already in progress; retry this request', 503);
    }
    return { owner };
  }

  async get(requestId: string) {
    const row = await this.repo.prisma.analysisRequest.findUnique({ where: { id: requestId } });
    if (!row?.workflowJson) return row;
    const metadata = JSON.parse(row.workflowJson);
    if (metadata.version !== 2) return row;
    const states = await this.repo.prisma.analysisSessionState.findMany({
      where: { requestId },
      orderBy: { position: 'asc' },
    });
    if (
      states.length !== metadata.sessionIds.length ||
      states.some((state, index) => state.id !== metadata.sessionIds[index])
    )
      throw new Error('Incomplete analysis checkpoint');
    return {
      ...row,
      workflowJson: JSON.stringify({
        version: 1,
        settings: metadata.settings,
        skipped: metadata.skipped,
        sessions: states.map(state => ({
          ...JSON.parse(state.inputJson),
          ...JSON.parse(state.stateJson),
        })),
      }),
    };
  }

  async checkpoint(
    requestId: string,
    owner: string,
    workflow: AnalysisWorkflow,
    input: AnalyzeDiscussionParams,
    session?: AnalysisSession,
  ): Promise<void> {
    // Acquire the fenced write before reading; independent sessions update distinct rows.
    await this.repo.prisma.$transaction(async tx => {
      const changed = await tx.analysisRequest.updateMany({
        where: {
          id: requestId,
          owner,
          state: AnalysisRequestState.Processing,
          leaseUntil: { gt: new Date() },
        },
        data: { errorJson: null },
      });
      if (!changed.count)
        throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
      const row = await tx.analysisRequest.findUniqueOrThrow({ where: { id: requestId } });
      const initialized = row.workflowJson && JSON.parse(row.workflowJson).version === 2;
      if (!initialized)
        await tx.analysisRequest.update({
          where: { id: requestId },
          data: {
            inputJson: row.inputJson ?? JSON.stringify(input),
            workflowJson: JSON.stringify({
              version: 2,
              settings: workflow.settings,
              skipped: workflow.skipped,
              sessionIds: workflow.sessions.map(item => item.id),
            }),
          },
        });
      const selected = initialized && session ? [session] : workflow.sessions;
      for (const item of selected) {
        const { messages, transcript, ...state } = item;
        await tx.analysisSessionState.upsert({
          where: { requestId_id: { requestId, id: item.id } },
          create: {
            requestId,
            id: item.id,
            position: workflow.sessions.findIndex(value => value.id === item.id),
            inputJson: JSON.stringify({ messages, transcript }),
            stateJson: JSON.stringify(state),
          },
          update: { stateJson: JSON.stringify(state) },
        });
      }
    });
  }

  async fail(requestId: string, owner: string, failure: AnalysisFailure): Promise<void> {
    await this.repo.prisma.analysisRequest.updateMany({
      where: {
        id: requestId,
        owner,
        state: AnalysisRequestState.Processing,
        leaseUntil: { gt: new Date() },
      },
      data: {
        state: failure.retryable ? AnalysisRequestState.Pending : AnalysisRequestState.Terminal,
        errorJson: JSON.stringify(failure),
        owner: null,
        leaseUntil: null,
      },
    });
  }

  async renew(requestId: string, owner: string): Promise<void> {
    const changed = await this.repo.prisma.analysisRequest.updateMany({
      where: {
        id: requestId,
        owner,
        state: AnalysisRequestState.Processing,
        leaseUntil: { gt: new Date() },
      },
      data: { leaseUntil: new Date(Date.now() + this.leaseMs) },
    });
    if (!changed.count)
      throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
  }
  async release(requestId: string, owner: string): Promise<void> {
    await this.repo.prisma.analysisRequest.updateMany({
      where: { id: requestId, owner, state: AnalysisRequestState.Processing },
      data: { state: AnalysisRequestState.Pending, owner: null, leaseUntil: null },
    });
  }

  async complete(
    params: AnalyzeDiscussionParams,
    owner: string,
    result: AnalyzeDiscussionResult,
    drafts: CandidateDraft[],
    graph?: GraphSnapshot,
  ): Promise<AnalyzeDiscussionResult> {
    return this.repo.prisma.$transaction(async tx => {
      // Take the write lock and fence an expired/stolen owner before creating anything.
      const fenced = await tx.analysisRequest.updateMany({
        where: {
          id: params.requestId,
          owner,
          state: AnalysisRequestState.Processing,
          leaseUntil: { gt: new Date() },
        },
        data: { state: AnalysisRequestState.Committing },
      });
      if (!fenced.count)
        throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
      const decisions: Decision[] = [];
      for (const draft of drafts) {
        const graphNode = graph?.sessions
          .flatMap(session => session.nodes)
          .find(node => node.id === draft.graphNodeId);
        const normalizedContent = normalizeContent(
          draft.decision.decisionContent ?? draft.decision.decision,
        );
        const key = hash({
          guildId: draft.decision.source.guildId,
          evidence: draft.evidenceJson,
          content: normalizedContent,
        });
        const identity = await tx.candidateIdentity.findUnique({ where: { key } });
        const legacyRows = identity
          ? []
          : await tx.decision.findMany({
              where: {
                guildId: draft.decision.source.guildId,
                channelId: draft.decision.source.channelId,
                evidenceHash: { in: [draft.legacyHash, draft.decision.evidenceHash ?? ''] },
              },
            });
        const matchingLegacy = legacyRows.find(row => {
          const stored = this.repo.decodeDecision(row);
          return (
            (normalizeContent(stored.decisionContent ?? stored.decision) === normalizedContent ||
              normalizeContent(stored.decision) === normalizedContent) &&
            stableJson(stored.source.rawMessages) ===
              stableJson(JSON.parse(draft.evidenceJson).messages)
          );
        });
        const existingRow = identity
          ? await tx.decision.findUnique({ where: { id: identity.decisionId } })
          : (matchingLegacy ?? null);
        const rejectedLegacyRows = legacyRows.filter(
          row => row.status === DecisionState.Rejected || row.status === 'rejected',
        );
        const legacyRejected =
          !identity &&
          (await tx.rejectedEvidenceHash.findUnique({ where: { evidenceHash: draft.legacyHash } }));
        const suppressLegacy =
          legacyRejected &&
          (rejectedLegacyRows.length === 0 ||
            rejectedLegacyRows.some(row => {
              const stored = this.repo.decodeDecision(row);
              return (
                normalizeContent(stored.decisionContent ?? stored.decision) === normalizedContent ||
                normalizeContent(stored.decision) === normalizedContent
              );
            }));
        // Rejections are candidate-scoped. Legacy hashes apply only to their exact original session.
        if (
          !params.isManualOverride &&
          (existingRow?.status === DecisionState.Rejected ||
            existingRow?.status === 'rejected' ||
            suppressLegacy)
        ) {
          if (graphNode) graphNode.suppressed = true;
          continue;
        }
        let decision: Decision;
        if (existingRow) {
          decision = this.repo.decodeDecision(existingRow);
          if (!identity)
            await tx.candidateIdentity.create({
              data: {
                key,
                decisionId: decision.id,
                guildId: decision.source.guildId,
                channelId: decision.source.channelId,
                evidenceJson: draft.evidenceJson,
                normalizedContent,
              },
            });
        } else {
          decision = {
            ...draft.decision,
            version: 1,
            actionItems: draft.decision.actionItems.map(item => ({
              ...item,
              id: item.id ?? randomUUID(),
              state: item.state ?? 'open',
            })),
          };
          await tx.decision.create({
            data: { id: decision.id, ...this.repo.decisionData(decision) },
          });
          await tx.candidateIdentity.create({
            data: {
              key,
              decisionId: decision.id,
              guildId: decision.source.guildId,
              channelId: decision.source.channelId,
              evidenceJson: draft.evidenceJson,
              normalizedContent,
            },
          });
        }
        const evidenceIds: string[] = JSON.parse(draft.evidenceJson).messages.map(
          (m: { id: string }) => m.id,
        );
        const nearby = await tx.candidateIdentity.findMany({
          where: { guildId: decision.source.guildId, channelId: decision.source.channelId },
        });
        const related = [
          ...new Set(
            nearby
              .filter(
                row =>
                  row.decisionId !== decision.id &&
                  JSON.parse(row.evidenceJson).messages.some((m: { id: string }) =>
                    evidenceIds.includes(m.id),
                  ),
              )
              .map(row => row.decisionId),
          ),
        ];
        const prior = await tx.candidateAnalysis.findMany({
          where: {
            decisionId: { in: [decision.id, ...related] },
            requestId: { not: params.requestId },
          },
        });
        await tx.candidateAnalysis.upsert({
          where: { requestId_decisionId: { requestId: params.requestId, decisionId: decision.id } },
          update: {},
          create: {
            requestId: params.requestId,
            decisionId: decision.id,
            relations: { create: related.map(relatedDecisionId => ({ relatedDecisionId })) },
            previousRequestsJson: JSON.stringify([...new Set(prior.map(row => row.requestId))]),
          },
        });
        if (!decisions.some(d => d.id === decision.id)) decisions.push(decision);
        if (graphNode) {
          graphNode.decisionId = decision.id;
          graphNode.decisionVersion = decision.version ?? 1;
        }
      }
      const completed: AnalyzeDiscussionResult = JSON.parse(
        JSON.stringify({ ...result, decisions, found: decisions.length > 0 }),
      );
      await tx.analysisRequest.update({
        where: { id: params.requestId },
        data: {
          state: AnalysisRequestState.Completed,
          owner: null,
          leaseUntil: null,
          resultJson: JSON.stringify(completed),
          completedAt: new Date(),
          graphJson: graph ? JSON.stringify(graph) : null,
          errorJson: null,
        },
      });
      return completed;
    });
  }

  async history(decisionId: string): Promise<CandidateHistoryEntry[]> {
    const rows = await this.repo.prisma.candidateAnalysis.findMany({
      where: { decisionId },
      include: { request: true, relations: true },
    });
    const reverse = await this.repo.prisma.candidateRelation.findMany({
      where: { relatedDecisionId: decisionId },
      select: { decisionId: true },
    });
    return rows.map(row => ({
      requestId: row.requestId,
      isManualOverride: row.request.manual,
      previousRequestIds: JSON.parse(row.previousRequestsJson),
      relatedCandidateIds: [
        ...new Set([
          ...row.relations.map(relation => relation.relatedDecisionId),
          ...reverse.map(relation => relation.decisionId),
        ]),
      ],
      createdAt: row.request.createdAt.toISOString(),
      graphAvailable: Boolean(row.request.graphJson),
      candidateNodeIds: row.request.graphJson
        ? (JSON.parse(row.request.graphJson) as GraphSnapshot).sessions.flatMap(session =>
            session.nodes.filter(node => node.decisionId === decisionId).map(node => node.id),
          )
        : [],
    }));
  }
}
