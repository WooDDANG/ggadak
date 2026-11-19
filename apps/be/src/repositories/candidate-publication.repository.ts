import type { Prisma } from '@prisma/client';
import type { Decision } from '@ggaddak/shared';
import { AnalysisRequestState } from '../domain/analysis-workflow.js';
import type { AnalyzeDiscussionResult } from '../domain/analysis.js';
import type { GraphSnapshot } from '../domain/decision-graph.js';
import { AnalysisRequestError } from './analysis-request.repository.js';
import { DecisionRepository } from './decision.repository.js';
import { AnalysisSessionRecoveryRepository } from './analysis-session-recovery.repository.js';
import type { NewSessionRecovery, RecoveryOwner } from '../domain/session-recovery.js';

/** 발행과 같은 트랜잭션에서 확정할 세션 복구 변경. 값은 서비스가 정책으로 계산한다. */
export interface PublicationRecovery {
  /** 이 발행이 복구 시도라면 그 소유권. */
  owner?: RecoveryOwner;
  /** 이번 분석에서 건너뛴 세션의 첫 복구 기록. */
  created: NewSessionRecovery[];
  /** 입력 보관 기한: 최초 요청 생성 시점부터의 시간. */
  inputRetentionMs: number;
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
    recovery?: PublicationRecovery,
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
      const recoveries = new AnalysisSessionRecoveryRepository(tx);
      if (recovery?.owner && !(await recoveries.confirmRecovered(recovery.owner, new Date())))
        throw new AnalysisRequestError('Recovery ownership expired', 503);
      if (recovery?.created.length) {
        const source = await tx.analysisRequest.findUniqueOrThrow({ where: { id: requestId } });
        await recoveries.createForRequest(
          requestId,
          source.guildId,
          new Date(source.createdAt.getTime() + recovery.inputRetentionMs),
          recovery.created,
        );
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
