import { Service } from 'typedi';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Decision, DecisionSchema, ExternalFeedback, ReviewAction } from '@ggaddak/shared';

/** Database is authoritative. Every mutation is awaited; no memory fallback exists. */
@Service()
export class DecisionRepository {
  constructor(public readonly prisma: PrismaClient) {}

  async getCheckpoint(channelId: string): Promise<string | null> {
    return (
      (await this.prisma.channelCheckpoint.findUnique({ where: { channelId } }))?.lastMessageId ??
      null
    );
  }
  async saveCheckpoint(channelId: string, lastMessageId: string): Promise<void> {
    await this.prisma.channelCheckpoint.upsert({
      where: { channelId },
      update: { lastMessageId, updatedAt: new Date() },
      create: { channelId, lastMessageId },
    });
  }
  async saveFeedback(fb: ExternalFeedback): Promise<void> {
    const data = {
      decisionId: fb.channelId,
      channelId: fb.channelId,
      source: fb.source,
      author: fb.source,
      content: fb.content,
      externalUrl: fb.detail ?? null,
      domainJson: JSON.stringify(fb),
      createdAt: new Date(fb.createdAt),
    };
    await this.prisma.externalFeedback.upsert({
      where: { id: fb.id },
      update: data,
      create: { id: fb.id, ...data },
    });
  }
  async getRecentFeedbacks(channelId?: string, limit = 5): Promise<ExternalFeedback[]> {
    const records = await this.prisma.externalFeedback.findMany({ orderBy: { createdAt: 'desc' } });
    return records
      .map(row =>
        row.domainJson
          ? (JSON.parse(row.domainJson) as ExternalFeedback)
          : {
              id: row.id,
              channelId: row.channelId ?? row.decisionId,
              source: row.source as ExternalFeedback['source'],
              content: row.content,
              ...(row.externalUrl ? { detail: row.externalUrl } : {}),
              createdAt: row.createdAt.toISOString(),
            },
      )
      .filter(fb => !channelId || fb.channelId === channelId || fb.channelId === 'global')
      .slice(0, limit);
  }
  async recordRejectedEvidence(evidenceHash: string): Promise<void> {
    await this.prisma.rejectedEvidenceHash.upsert({
      where: { evidenceHash },
      update: {},
      create: { evidenceHash, reason: 'rejected' },
    });
  }
  async isEvidenceRejected(evidenceHash: string): Promise<boolean> {
    return Boolean(await this.prisma.rejectedEvidenceHash.findUnique({ where: { evidenceHash } }));
  }
  decodeDecision(row: Prisma.DecisionGetPayload<object>): Decision {
    if (row.domainJson) return { ...JSON.parse(row.domainJson), version: row.version };
    const states: Record<string, Decision['state']> = {
      proposed: 'Proposed',
      confirmed: 'Decided',
      rejected: 'Rejected',
    };
    return {
      id: row.id,
      version: row.version,
      topic: row.title,
      title: row.title,
      decision: row.decisionSummary,
      rationale: row.keyReason,
      state: states[row.status] ?? (row.status as Decision['state']),
      supersedesId: row.supersedesId,
      supersededById: row.supersededById,
      rationaleQuotes: [],
      alternatives: JSON.parse(row.alternatives),
      categoryTag: JSON.parse(row.tags)[0] ?? '기타',
      actionItems: [],
      isPivot: false,
      approvedBy: row.decisionMaker === 'AI' ? null : row.decisionMaker || null,
      decisionConfirmedDate: null,
      feedbackSourceType: null,
      feedbackSourceDetail: null,
      feedbackReceivedDate: null,
      rawEvidence: [],
      evidenceHash: row.evidenceHash || undefined,
      rawTranscript: row.evidenceSummary || undefined,
      source: {
        guildId: row.guildId,
        channelId: row.channelId,
        triggerMessageId: row.messageId,
        participants: JSON.parse(row.participants),
        rawMessages: [],
        ...(row.sourceJumpUrl ? { messageUrl: row.sourceJumpUrl } : {}),
      },
      createdAt: row.createdAt.toISOString(),
      governanceScore: row.governanceScore,
      governanceReason: row.governanceReason,
      governancePassed: row.governancePassed,
    };
  }
  decisionData(decision: Decision) {
    return {
      guildId: decision.source.guildId,
      channelId: decision.source.channelId,
      messageId: decision.source.triggerMessageId,
      title: decision.title ?? decision.topic,
      decisionSummary: decision.decisionContent ?? decision.decision,
      keyReason: decision.rationale,
      status: decision.state,
      decisionMaker: decision.approvedBy ?? '',
      participants: JSON.stringify(decision.source.participants),
      alternatives: JSON.stringify(decision.alternatives),
      tags: JSON.stringify([decision.categoryTag]),
      supersedesId: decision.supersedesId,
      supersededById: decision.supersededById ?? null,
      sourceJumpUrl: decision.source.messageUrl ?? '',
      evidenceSummary: decision.rawTranscript ?? '',
      evidenceHash: decision.evidenceHash ?? '',
      governanceScore: decision.governanceScore ?? 0,
      governanceReason: decision.governanceReason ?? '',
      governancePassed: decision.governancePassed ?? false,
      createdAt: new Date(decision.createdAt),
      domainJson: JSON.stringify(decision),
      version: decision.version ?? 1,
    };
  }
  async saveDecision(decision: Decision): Promise<void> {
    decision = DecisionSchema.parse(decision);
    const existing = await this.getDecisionById(decision.id);
    const stored = {
      ...decision,
      createdAt: existing?.createdAt ?? decision.createdAt,
      version: existing ? (existing.version ?? 1) + 1 : (decision.version ?? 1),
      actionItems: decision.actionItems.map((item, index) => ({
        ...item,
        id: item.id ?? existing?.actionItems[index]?.id ?? randomUUID(),
        state: item.state ?? existing?.actionItems[index]?.state ?? ('unknown' as const),
      })),
    };
    const data = this.decisionData(stored);
    await this.prisma.decision.upsert({
      where: { id: decision.id },
      update: data,
      create: { id: decision.id, ...data },
    });
  }
  async getDecisionById(id: string): Promise<Decision | null> {
    const row = await this.prisma.decision.findUnique({ where: { id } });
    return row ? this.decodeDecision(row) : null;
  }
  async getDecisions(
    filter: { topic?: string; state?: string; categoryTag?: string } = {},
  ): Promise<Decision[]> {
    return (await this.prisma.decision.findMany({ orderBy: { createdAt: 'desc' } }))
      .map(row => this.decodeDecision(row))
      .filter(
        d =>
          (!filter.topic || d.topic.includes(filter.topic) || d.title?.includes(filter.topic)) &&
          (!filter.state || d.state === filter.state) &&
          (!filter.categoryTag || d.categoryTag === filter.categoryTag),
      );
  }
  async reviewDecision(
    id: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'> = {},
  ): Promise<Decision | null> {
    const existing = await this.getDecisionById(id);
    if (!existing) return null;
    const updated = { ...existing };
    if (action === 'confirm' || action === 'edit') {
      for (const field of [
        'title',
        'decisionContent',
        'rationale',
        'rationaleSummary',
        'rationaleQuotes',
        'categoryTag',
      ] as const) {
        if (params[field] !== undefined) Object.assign(updated, { [field]: params[field] });
      }
    }
    if (action === 'confirm') {
      updated.state = 'Decided';
      updated.approvedBy = params.approvedBy ?? 'Reviewer';
      updated.decisionConfirmedDate = new Date().toISOString();
    }
    if (action === 'defer') updated.state = 'Deferred';
    if (action === 'reject') updated.state = 'Rejected';
    await this.prisma.$transaction(async tx => {
      const data = this.decisionData({ ...updated, version: (existing.version ?? 1) + 1 });
      await tx.decision.update({ where: { id }, data });
      if (action === 'reject' && updated.evidenceHash)
        await tx.rejectedEvidenceHash.upsert({
          where: { evidenceHash: updated.evidenceHash },
          update: {},
          create: { evidenceHash: updated.evidenceHash, reason: 'rejected' },
        });
    });
    return this.getDecisionById(id);
  }
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
