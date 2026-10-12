import { createHash, randomUUID } from 'node:crypto';
import { Decision, DecisionSchema } from '@ggaddak/shared';
import { DecisionRepository } from './decision.repository.js';
import type {
  AnalyzeDiscussionParams,
  AnalyzeDiscussionResult,
} from '../services/discussion.service.js';

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
}
export interface CandidateHistoryEntry {
  requestId: string;
  isManualOverride: boolean;
  previousRequestIds: string[];
  relatedCandidateIds: string[];
  createdAt: string;
}

export class AnalysisRequestRepository {
  constructor(
    private repo: DecisionRepository,
    private leaseMs = 60_000,
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
        state: 'pending',
      },
    });
    const row = await this.repo.prisma.analysisRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (row.fingerprint !== fingerprint)
      throw new AnalysisRequestError('requestId was already used with different payload', 409);
    if (row.state === 'completed') return { owner, result: JSON.parse(row.resultJson!) };
    const changed = await this.repo.prisma.analysisRequest.updateMany({
      where: {
        id: requestId,
        fingerprint,
        state: { not: 'completed' },
        OR: [{ owner: null }, { leaseUntil: { lte: now } }],
      },
      data: { owner, state: 'processing', leaseUntil: new Date(now.getTime() + this.leaseMs) },
    });
    if (!changed.count) {
      const current = await this.repo.prisma.analysisRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      if (current.state === 'completed') return { owner, result: JSON.parse(current.resultJson!) };
      throw new AnalysisRequestError('Analysis is already in progress; retry this request', 503);
    }
    return { owner };
  }

  async renew(requestId: string, owner: string): Promise<void> {
    const changed = await this.repo.prisma.analysisRequest.updateMany({
      where: { id: requestId, owner, state: 'processing', leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + this.leaseMs) },
    });
    if (!changed.count)
      throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
  }
  async release(requestId: string, owner: string): Promise<void> {
    await this.repo.prisma.analysisRequest.updateMany({
      where: { id: requestId, owner, state: 'processing' },
      data: { state: 'pending', owner: null, leaseUntil: null },
    });
  }

  async complete(
    params: AnalyzeDiscussionParams,
    owner: string,
    result: AnalyzeDiscussionResult,
    drafts: CandidateDraft[],
  ): Promise<AnalyzeDiscussionResult> {
    return this.repo.prisma.$transaction(async tx => {
      // Take the write lock and fence an expired/stolen owner before creating anything.
      const fenced = await tx.analysisRequest.updateMany({
        where: { id: params.requestId, owner, state: 'processing', leaseUntil: { gt: new Date() } },
        data: { state: 'committing' },
      });
      if (!fenced.count)
        throw new AnalysisRequestError('Analysis ownership expired; retry this request', 503);
      const decisions: Decision[] = [];
      for (const draft of drafts) {
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
          row => row.status === 'Rejected' || row.status === 'rejected',
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
          (existingRow?.status === 'Rejected' ||
            existingRow?.status === 'rejected' ||
            suppressLegacy)
        )
          continue;
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
          decision = DecisionSchema.parse({
            ...draft.decision,
            version: 1,
            actionItems: draft.decision.actionItems.map(item => ({
              ...item,
              id: item.id ?? randomUUID(),
              state: item.state ?? 'open',
            })),
          });
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
            relatedJson: JSON.stringify(related),
            previousRequestsJson: JSON.stringify([...new Set(prior.map(row => row.requestId))]),
          },
        });
        if (!decisions.some(d => d.id === decision.id)) decisions.push(decision);
      }
      const completed: AnalyzeDiscussionResult = JSON.parse(
        JSON.stringify({ ...result, decisions, found: decisions.length > 0 }),
      );
      await tx.analysisRequest.update({
        where: { id: params.requestId },
        data: {
          state: 'completed',
          owner: null,
          leaseUntil: null,
          resultJson: JSON.stringify(completed),
          completedAt: new Date(),
        },
      });
      return completed;
    });
  }

  async history(decisionId: string): Promise<CandidateHistoryEntry[]> {
    const rows = await this.repo.prisma.candidateAnalysis.findMany({ where: { decisionId } });
    return Promise.all(
      rows.map(async row => {
        const request = await this.repo.prisma.analysisRequest.findUniqueOrThrow({
          where: { id: row.requestId },
        });
        // Include reverse overlap so earlier candidates also expose later related candidates.
        const others = await this.repo.prisma.candidateAnalysis.findMany();
        const related = [
          ...new Set([
            ...JSON.parse(row.relatedJson),
            ...others
              .filter(other => JSON.parse(other.relatedJson).includes(decisionId))
              .map(other => other.decisionId),
          ]),
        ];
        return {
          requestId: row.requestId,
          isManualOverride: request.manual,
          previousRequestIds: JSON.parse(row.previousRequestsJson),
          relatedCandidateIds: related,
          createdAt: request.createdAt.toISOString(),
        };
      }),
    );
  }
}
