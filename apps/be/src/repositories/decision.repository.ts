import { DecisionEditSchema, DecisionEditDto } from '../dto/decision-edit.dto.js';
import { Service } from 'typedi';
import { PrismaClient, Prisma } from '@prisma/client';
import { BadRequestError, ConflictError } from '../errors/AppError.js';
import { randomUUID } from 'node:crypto';
import {
  Decision,
  DecisionSchema,
  ExternalFeedback,
  ReviewAction,
  ReviewActionSchema,
} from '@ggaddak/shared';

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
    if (row.domainJson)
      return {
        ...JSON.parse(row.domainJson),
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
      };
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
      updatedAt: row.updatedAt.toISOString(),
      governanceScore: row.governanceScore,
      governanceReason: row.governanceReason,
      governancePassed: row.governancePassed,
    };
  }
  decisionData(decision: Decision) {
    return {
      lifecycle:
        decision.state === 'Decided'
          ? 'CONFIRMED'
          : decision.state === 'Superseded'
            ? 'SUPERSEDED'
            : decision.state === 'Deferred'
              ? 'ON_HOLD'
              : decision.state === 'Rejected'
                ? 'DISCARDED'
                : 'IN_REVIEW',
      category: decision.categoryTag,
      topic: decision.topic,
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
    if (
      existing &&
      (existing.version !== decision.version ||
        existing.state !== decision.state ||
        existing.supersededById !== decision.supersededById ||
        existing.supersedesId !== decision.supersedesId)
    )
      throw new ConflictError('Use versioned review for decision transitions');
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
    if (existing) {
      const result = await this.prisma.decision.updateMany({
        where: { id: decision.id, version: existing.version },
        data,
      });
      if (result.count !== 1) throw new ConflictError('Stale saved decision version');
    } else {
      await this.prisma.decision.create({ data: { id: decision.id, ...data } });
    }
  }
  async editDecision(id: string, body: DecisionEditDto, actorId: string): Promise<Decision | null> {
    const parsed = DecisionEditSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestError('Invalid decision edit', parsed.error.flatten());
    const edit = parsed.data;
    return this.prisma.$transaction(async tx => {
      const row = await tx.decision.findUnique({ where: { id } });
      if (!row) return null;
      if (row.version !== edit.expectedVersion) throw new ConflictError('Stale decision version');
      const old = this.decodeDecision(row);
      if (old.state === 'Superseded' || old.state === 'Rejected')
        throw new ConflictError('Historical decisions cannot be edited');
      const ids = old.alternatives.map((a, index) => a.id ?? `${id}:alternative:${index}`);
      const supplied = edit.alternatives.flatMap(a => (a.id ? [a.id] : []));
      if (
        new Set(supplied).size !== supplied.length ||
        supplied.some(value => !ids.includes(value))
      )
        throw new BadRequestError('Unknown or duplicate alternative ID');
      const updated = {
        ...old,
        title: edit.title,
        decision: edit.decision,
        decisionContent: edit.decision,
        rationale: edit.rationale,
        rationaleSummary: edit.rationale,
        categoryTag: edit.category,
        version: row.version + 1,
        alternatives: edit.alternatives.map(a => ({
          id: a.id ?? randomUUID(),
          option: a.name,
          reason: a.reason,
        })),
      };
      const result = await tx.decision.updateMany({
        where: { id, version: edit.expectedVersion },
        data: this.decisionData(updated),
      });
      if (result.count !== 1) throw new ConflictError('Stale decision version');
      await tx.decisionEdit.create({
        data: {
          id: randomUUID(),
          decisionId: id,
          actorId,
          version: updated.version,
          beforeJson: JSON.stringify(old),
        },
      });
      return this.decodeDecision((await tx.decision.findUnique({ where: { id } }))!);
    });
  }
  async getDecisionById(id: string): Promise<Decision | null> {
    const row = await this.prisma.decision.findUnique({ where: { id } });
    return row ? this.decodeDecision(row) : null;
  }
  async getDecisions(
    filter: { guildId?: string; topic?: string; state?: string; categoryTag?: string } = {},
  ): Promise<Decision[]> {
    return (
      await this.prisma.decision.findMany({
        where: filter.guildId ? { guildId: filter.guildId } : {},
        orderBy: { createdAt: 'desc' },
      })
    )
      .map(row => this.decodeDecision(row))
      .filter(
        d =>
          (!filter.topic || d.topic.includes(filter.topic) || d.title?.includes(filter.topic)) &&
          (!filter.state || d.state === filter.state) &&
          (!filter.categoryTag || d.categoryTag === filter.categoryTag),
      );
  }
  async browseDecisions(filter: {
    guildId: string;
    status?: string;
    category?: string;
    topic?: string;
    page: number;
    size: number;
  }) {
    const where: Prisma.DecisionWhereInput = {
      guildId: filter.guildId,
      ...(filter.status ? { lifecycle: filter.status } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.topic
        ? { OR: [{ topic: { contains: filter.topic } }, { title: { contains: filter.topic } }] }
        : {}),
    };
    const [rows, totalElements] = await this.prisma.$transaction([
      this.prisma.decision.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (filter.page - 1) * filter.size,
        take: filter.size,
      }),
      this.prisma.decision.count({ where }),
    ]);
    return {
      decisions: rows.map(row => this.decodeDecision(row)),
      pageInfo: {
        currentPage: filter.page,
        pageSize: filter.size,
        totalElements,
        totalPages: Math.ceil(totalElements / filter.size),
      },
    };
  }
  async reviewDecision(
    id: string,
    action: ReviewAction['action'],
    params: Omit<ReviewAction, 'action'>,
  ): Promise<Decision | null> {
    const parsed = ReviewActionSchema.safeParse({ action, ...params });
    if (!parsed.success)
      throw new BadRequestError('Invalid versioned review', parsed.error.flatten());
    params = parsed.data;
    const existing = await this.getDecisionById(id);
    if (!existing) return null;
    if (params.expectedVersion !== existing.version)
      throw new ConflictError('Stale candidate version');
    if (!['Draft', 'Proposed', 'Discussing', 'Deferred'].includes(existing.state))
      throw new ConflictError('Decision is no longer reviewable');
    if (params.resolution === 'replace' && action !== 'confirm')
      throw new BadRequestError('Replacement requires confirmation');
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
    // A saved suggestion is not a replacement link until explicitly approved.
    if (action === 'confirm' && params.resolution !== 'replace') updated.supersedesId = null;
    await this.prisma
      .$transaction(async tx => {
        if (params.resolution === 'replace') {
          if (!params.predecessorId || !params.predecessorVersion || params.predecessorId === id)
            throw new BadRequestError('A distinct predecessor and its version are required');
          const row = await tx.decision.findUnique({ where: { id: params.predecessorId } });
          if (!row) throw new ConflictError('Predecessor no longer exists');
          const predecessor = this.decodeDecision(row);
          if (
            predecessor.version !== params.predecessorVersion ||
            predecessor.state !== 'Decided' ||
            predecessor.supersededById
          )
            throw new ConflictError('Stale or inactive predecessor');
          if (predecessor.source.guildId !== existing.source.guildId)
            throw new BadRequestError('Predecessor must belong to the same guild');
          const choices = new Map(
            (params.taskDispositions ?? []).map(choice => [choice.actionItemId, choice]),
          );
          if (
            choices.size !== (params.taskDispositions ?? []).length ||
            [...choices.keys()].some(key => !predecessor.actionItems.some(item => item.id === key))
          )
            throw new BadRequestError('Invalid or duplicate Action Item disposition');
          predecessor.actionItems = predecessor.actionItems.map(item => {
            const choice = item.id ? choices.get(item.id) : undefined;
            let state = item.state ?? 'unknown';
            if (state === 'unknown') {
              if (!choice?.classification)
                throw new BadRequestError('Classify unknown Action Item completion');
              state = choice.classification;
            } else if (choice?.classification && choice.classification !== state) {
              throw new BadRequestError('Only unknown Action Items require classification');
            }
            if (state !== 'open') {
              if (choice?.disposition)
                throw new BadRequestError('Only unfinished Action Items can be disposed');
              return { ...item, state };
            }
            if (!choice?.disposition)
              throw new BadRequestError('Every unfinished Action Item needs cancel or transfer');
            if (choice.disposition === 'transfer') {
              updated.actionItems = [
                ...updated.actionItems,
                {
                  ...item,
                  id: randomUUID(),
                  state: 'open',
                  transferredFromDecisionId: predecessor.id,
                  transferredFromActionItemId: item.id,
                  transferredToDecisionId: undefined,
                },
              ];
              return { ...item, state: 'transferred' as const, transferredToDecisionId: id };
            }
            return { ...item, state: 'canceled' as const };
          });
          predecessor.state = 'Superseded';
          predecessor.supersededById = id;
          predecessor.version = params.predecessorVersion + 1;
          const replaced = await tx.decision.updateMany({
            where: {
              id: predecessor.id,
              version: params.predecessorVersion,
              status: 'Decided',
              supersededById: null,
            },
            data: this.decisionData(predecessor),
          });
          if (replaced.count !== 1) throw new ConflictError('Predecessor was already replaced');
          updated.supersedesId = predecessor.id;
        }
        const data = this.decisionData({ ...updated, version: (existing.version ?? 1) + 1 });
        const result = await tx.decision.updateMany({
          where: { id, version: params.expectedVersion },
          data,
        });
        if (result.count !== 1) throw new ConflictError('Stale candidate version');
        if (action === 'reject' && updated.evidenceHash)
          await tx.rejectedEvidenceHash.upsert({
            where: { evidenceHash: updated.evidenceHash },
            update: {},
            create: { evidenceHash: updated.evidenceHash, reason: 'rejected' },
          });
      })
      .catch(error => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2028', 'P2034', 'P1008'].includes(error.code)
        )
          throw new ConflictError(
            'Concurrent review changed this decision; reload before reviewing',
          );
        throw error;
      });
    return this.getDecisionById(id);
  }
  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
