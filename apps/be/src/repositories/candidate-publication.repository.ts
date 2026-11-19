import type { Prisma } from '@prisma/client';
import type { Decision } from '@ggaddak/shared';
import { AnalysisRequestState } from '../domain/analysis-workflow.js';
import type { AnalyzeDiscussionResult } from '../domain/analysis.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AnalysisRequestError } from './analysis-request.repository.js';
import { NON_RETRYABLE_SESSION_FAILURES } from '../errors/ai-diagnostics.js';
import { DecisionRepository } from './decision.repository.js';

export interface RecoveryOwner {
  requestId: string;
  sessionId: string;
  owner: string;
}

/** All candidate reads and writes use the same fenced publication transaction. */
export class CandidatePublicationRepository {
  constructor(
    private readonly repo: DecisionRepository,
    private readonly db: Prisma.TransactionClient = repo.prisma,
  ) {}

  async commit(
    requestId: string,
    owner: string,
    publish: (store: CandidatePublicationRepository) => Promise<{
      result: AnalyzeDiscussionResult;
      graph?: GraphSnapshot;
    }>,
    recovery?: RecoveryOwner,
  ): Promise<AnalyzeDiscussionResult> {
    return this.repo.prisma.$transaction(async tx => {
      const fenced = await tx.analysisRequest.updateMany({
        where: {
          id: requestId,
          owner,
          state: AnalysisRequestState.Processing,
          leaseUntil: { gt: new Date() },
        },
        data: { state: AnalysisRequestState.Committing },
      });
      if (!fenced.count)
        throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
      const { result, graph } = await publish(new CandidatePublicationRepository(this.repo, tx));
      if (recovery) {
        const now = new Date();
        const recovered = await tx.analysisSessionRecovery.updateMany({
          where: { ...recovery, expiresAt: { gt: now }, leaseUntil: { gt: now } },
          data: { state: 'recovered', owner: null, leaseUntil: null },
        });
        if (!recovered.count) throw new AnalysisRequestError('Recovery ownership expired', 503);
      }
      if (result.skippedSessions?.length) {
        const source = await tx.analysisRequest.findUniqueOrThrow({ where: { id: requestId } });
        const expiresAt = new Date(source.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        await tx.analysisSessionRecovery.createMany({
          data: result.skippedSessions.map(session => ({
            requestId,
            sessionId: session.sessionId,
            guildId: source.guildId,
            nextAttemptAt: new Date(Date.parse(session.failedAt) + 60_000),
            expiresAt,
            failureKind: session.kind,
            // 같은 입력과 상한으로는 결과가 같으므로 수동 재분석만 허용한다.
            ...(NON_RETRYABLE_SESSION_FAILURES.includes(session.kind)
              ? { state: 'exhausted' }
              : {}),
          })),
        });
      }
      await tx.analysisRequest.update({
        where: { id: requestId },
        data: {
          state: AnalysisRequestState.Completed,
          owner: null,
          leaseUntil: null,
          resultJson: JSON.stringify(result),
          completedAt: new Date(),
          graphJson: graph ? JSON.stringify(graph) : null,
          errorJson: null,
        },
      });
      return result;
    });
  }

  identity(key: string) {
    return this.db.candidateIdentity.findUnique({ where: { key } });
  }

  async legacyCandidates(guildId: string, channelId: string, hashes: string[]) {
    const rows = await this.db.decision.findMany({
      where: { guildId, channelId, evidenceHash: { in: hashes } },
    });
    return rows.map(row => this.repo.decodeDecision(row));
  }

  async decision(id: string) {
    const row = await this.db.decision.findUnique({ where: { id } });
    return row ? this.repo.decodeDecision(row) : null;
  }

  rejectedEvidence(evidenceHash: string) {
    return this.db.rejectedEvidenceHash.findUnique({ where: { evidenceHash } });
  }

  async createDecision(decision: Decision): Promise<Decision> {
    await this.db.decision.create({
      data: { id: decision.id, ...this.repo.decisionData(decision) },
    });
    return decision;
  }

  async createIdentity(
    key: string,
    decision: Decision,
    evidenceJson: string,
    normalizedContent: string,
  ) {
    await this.db.candidateIdentity.create({
      data: {
        key,
        decisionId: decision.id,
        guildId: decision.source.guildId,
        channelId: decision.source.channelId,
        evidenceJson,
        normalizedContent,
      },
    });
  }

  identities(guildId: string, channelId: string) {
    return this.db.candidateIdentity.findMany({
      where: { guildId, channelId },
      select: { decisionId: true, evidenceJson: true },
    });
  }

  previousAnalyses(decisionIds: string[], requestId: string) {
    return this.db.candidateAnalysis.findMany({
      where: { decisionId: { in: decisionIds }, requestId: { not: requestId } },
      select: { requestId: true },
    });
  }

  async link(
    requestId: string,
    decisionId: string,
    related: string[],
    previousRequestIds: string[],
  ) {
    await this.db.candidateAnalysis.upsert({
      where: { requestId_decisionId: { requestId, decisionId } },
      update: {},
      create: {
        requestId,
        decisionId,
        relations: { create: related.map(relatedDecisionId => ({ relatedDecisionId })) },
        previousRequestsJson: JSON.stringify(previousRequestIds),
      },
    });
  }
}
