import { AnalysisRequestState } from '../domain/analysis-workflow.js';
import { AnalysisPolicy } from '@ggaddak/shared';

import { randomUUID } from 'node:crypto';
import { hash } from '../domain/analysis-identity.js';
import type { CandidateHistoryEntry } from '../domain/candidate-publication.js';
export type { CandidateHistoryEntry } from '../domain/candidate-publication.js';

import { DecisionRepository } from './decision.repository.js';
import type { AnalyzeDiscussionParams, AnalyzeDiscussionResult } from '../domain/analysis.js';
import type {
  AnalysisWorkflow,
  AnalysisFailure,
  AnalysisSession,
} from '../domain/analysis-workflow.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AnalysisBusyError } from '../errors/analysis-error.js';

export class AnalysisRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
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
      throw new AnalysisBusyError('Analysis is already in progress; retry this request');
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
