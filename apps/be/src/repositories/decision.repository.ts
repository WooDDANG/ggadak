import {
  ActionItemState,
  Decision,
  DecisionState,
  ExternalFeedback,
  ExternalFeedbackSchema,
  DecisionSchema,
} from '@ggaddak/shared';

import { BaseRepository } from './base.repository.js';
import { Service } from 'typedi';
import { PrismaClient, Prisma } from '@prisma/client';
import { BadRequestError, ConflictError } from '../errors/AppError.js';
import { randomUUID } from 'node:crypto';

type TimelineGroupBy = 'month' | 'topic' | 'channel' | 'category';

/** Database is authoritative. Every mutation is awaited; no memory fallback exists. */
@Service()
export class DecisionRepository extends BaseRepository {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async getCheckpoint(channelId: string, tx?: Prisma.TransactionClient): Promise<string | null> {
    return (
      (await (tx ?? this.prisma).channelCheckpoint.findUnique({ where: { channelId } }))
        ?.lastMessageId ?? null
    );
  }
  async saveCheckpoint(
    channelId: string,
    lastMessageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const write = async (client: Prisma.TransactionClient) => {
      const previous = await client.channelCheckpoint.findUnique({ where: { channelId } });
      if (
        previous &&
        /^\d+$/.test(previous.lastMessageId) &&
        /^\d+$/.test(lastMessageId) &&
        BigInt(lastMessageId) <= BigInt(previous.lastMessageId)
      )
        return;
      await client.channelCheckpoint.upsert({
        where: { channelId },
        update: { lastMessageId, updatedAt: new Date() },
        create: { channelId, lastMessageId },
      });
    };
    await this.withTransaction(write, tx);
  }

  async saveFeedback(fb: ExternalFeedback, tx?: Prisma.TransactionClient): Promise<void> {
    fb = ExternalFeedbackSchema.parse(fb);
    const data = {
      channelId: fb.channelId,
      source: fb.source,
      content: fb.content,
      detail: fb.detail ?? null,
      createdAt: new Date(fb.createdAt),
    };
    await (tx ?? this.prisma).externalFeedback.upsert({
      where: { id: fb.id },
      update: data,
      create: { id: fb.id, ...data },
    });
  }
  async getRecentFeedbacks(
    channelId?: string,
    limit = 5,
    tx?: Prisma.TransactionClient,
  ): Promise<ExternalFeedback[]> {
    const records = await (tx ?? this.prisma).externalFeedback.findMany({
      where: channelId ? { channelId: { in: [channelId, 'global'] } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(row => ({
      id: row.id,
      channelId: row.channelId,
      source: row.source as ExternalFeedback['source'],
      content: row.content,
      ...(row.detail !== null ? { detail: row.detail } : {}),
      createdAt: row.createdAt.toISOString(),
    }));
  }
  async recordRejectedEvidence(evidenceHash: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).rejectedEvidenceHash.upsert({
      where: { evidenceHash },
      update: {},
      create: { evidenceHash },
    });
  }
  async isEvidenceRejected(evidenceHash: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    return Boolean(
      await (tx ?? this.prisma).rejectedEvidenceHash.findUnique({ where: { evidenceHash } }),
    );
  }
  decodeDecision(row: Prisma.DecisionGetPayload<object>): Decision {
    if (row.storageVersion !== 1) throw new Error('Unsupported Decision storage version');
    return DecisionSchema.parse({
      ...JSON.parse(row.domainJson),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  decisionData(decision: Decision) {
    decision = DecisionSchema.parse(decision);
    return {
      storageVersion: 1,
      lifecycle:
        decision.state === DecisionState.Decided
          ? 'CONFIRMED'
          : decision.state === DecisionState.Superseded
            ? 'SUPERSEDED'
            : decision.state === DecisionState.Deferred
              ? 'ON_HOLD'
              : decision.state === DecisionState.Rejected
                ? 'DISCARDED'
                : 'IN_REVIEW',
      category: decision.categoryTag,
      topic: decision.topic,
      guildId: decision.source.guildId,
      channelId: decision.source.channelId,
      title: decision.title ?? decision.topic,
      status: decision.state,
      supersedesId: decision.supersedesId,
      supersededById: decision.supersededById ?? null,
      evidenceHash: decision.evidenceHash ?? '',
      createdAt: new Date(decision.createdAt),
      confirmedAt: decision.decisionConfirmedDate ? new Date(decision.decisionConfirmedDate) : null,
      domainJson: JSON.stringify(decision),
      version: decision.version ?? 1,
    };
  }

  async getConfirmedTimeline(
    filter: {
      guildId: string;
      groupBy: TimelineGroupBy;
      timezone: string;
      from?: string;
      to?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const supported = ['month', 'topic', 'channel', 'category'];
    if (!supported.includes(filter.groupBy)) throw new BadRequestError('Unsupported groupBy');
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: filter.timezone });
    } catch {
      throw new BadRequestError('Invalid timezone');
    }
    const parseInstant = (value: string | undefined) => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
        throw new BadRequestError('from and to must be ISO 8601 timestamps');
      const instant = new Date(value);
      if (!Number.isFinite(instant.getTime()))
        throw new BadRequestError('from and to must be valid ISO timestamps');
      return instant;
    };
    const from = parseInstant(filter.from);
    const to = parseInstant(filter.to);
    if (from && to && from >= to)
      throw new BadRequestError('from and to must be valid ISO timestamps with from before to');
    const rows = await (tx ?? this.prisma).decision.findMany({
      where: {
        guildId: filter.guildId,
        lifecycle: 'CONFIRMED',
        confirmedAt: {
          not: null,
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: to } : {}),
        },
      },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'asc' }],
    });
    const formatter =
      filter.groupBy === 'month'
        ? new Intl.DateTimeFormat('en-US', {
            timeZone: filter.timezone,
            year: 'numeric',
            month: '2-digit',
          })
        : undefined;
    const groups = new Map<string, Decision[]>();
    for (const row of rows) {
      const decision = this.decodeDecision(row);
      let key: string;
      if (filter.groupBy === 'month') {
        const parts = Object.fromEntries(
          formatter!.formatToParts(row.confirmedAt!).map(part => [part.type, part.value]),
        );
        key = `${parts.year}-${parts.month}`;
      } else if (filter.groupBy === 'topic') key = decision.topic;
      else if (filter.groupBy === 'channel') key = decision.source.channelId;
      else key = decision.categoryTag;
      groups.set(key, [...(groups.get(key) ?? []), decision]);
    }
    return {
      groupBy: filter.groupBy,
      timezone: filter.timezone,
      totalElements: rows.length,
      groups: [...groups].map(([key, items]) => ({ key, count: items.length, items })),
    };
  }
  async saveDecision(decision: Decision, tx?: Prisma.TransactionClient): Promise<void> {
    const existing = await this.getDecisionById(decision.id, tx);
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
        state: item.state ?? existing?.actionItems[index]?.state ?? ActionItemState.Unknown,
      })),
    };
    const data = this.decisionData(stored);
    if (existing) {
      const result = await (tx ?? this.prisma).decision.updateMany({
        where: { id: decision.id, version: existing.version },
        data,
      });
      if (result.count !== 1) throw new ConflictError('Stale saved decision version');
    } else {
      await this.withPrismaErrors(() =>
        (tx ?? this.prisma).decision.create({ data: { id: decision.id, ...data } }),
      );
    }
  }
  /** Compare-and-swap persists a prepared entity; the Service interprets a lost version race. */
  async editDecision(
    updated: Decision,
    expectedVersion: number,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decision | null> {
    return this.withTransaction(async context => {
      const row = await context.decision.findUnique({ where: { id: updated.id } });
      if (!row) return null;
      const result = await context.decision.updateMany({
        where: { id: updated.id, version: expectedVersion },
        data: this.decisionData(updated),
      });
      if (result.count !== 1) return null;
      await context.decisionEdit.create({
        data: {
          id: randomUUID(),
          decisionId: updated.id,
          actorId,
          version: updated.version ?? expectedVersion + 1,
          beforeJson: JSON.stringify(this.decodeDecision(row)),
        },
      });
      return this.getDecisionById(updated.id, context);
    }, tx);
  }
  async getDecisionVersions(ids: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.decision.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, version: true },
    });
    return new Map(rows.map(row => [row.id, row.version]));
  }

  async getDecisionById(id: string, tx?: Prisma.TransactionClient): Promise<Decision | null> {
    const row = await (tx ?? this.prisma).decision.findUnique({ where: { id } });
    return row ? this.decodeDecision(row) : null;
  }
  async getDecisions(
    filter: { guildId?: string; topic?: string; state?: string; categoryTag?: string } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Decision[]> {
    return (
      await (tx ?? this.prisma).decision.findMany({
        where: {
          ...(filter.guildId ? { guildId: filter.guildId } : {}),
          ...(filter.state ? { status: filter.state } : {}),
          ...(filter.categoryTag ? { category: filter.categoryTag } : {}),
        },
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
  async browseDecisions(
    filter: {
      guildId: string;
      status?: string;
      category?: string;
      topic?: string;
      page: number;
      size: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const where: Prisma.DecisionWhereInput = {
      guildId: filter.guildId,
      ...(filter.status ? { lifecycle: filter.status } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.topic
        ? { OR: [{ topic: { contains: filter.topic } }, { title: { contains: filter.topic } }] }
        : {}),
    };
    const [rows, totalElements] = await this.withTransaction(
      async context =>
        Promise.all([
          context.decision.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip: (filter.page - 1) * filter.size,
            take: filter.size,
          }),
          context.decision.count({ where }),
        ]),
      tx,
    );
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
  /** Conditional persistence only; the Service owns review policy and the transaction. */
  async writeReviewedDecision(
    decision: Decision,
    expectedVersion: number,
    tx: Prisma.TransactionClient,
    requireActivePredecessor = false,
  ): Promise<boolean> {
    const result = await tx.decision.updateMany({
      where: {
        id: decision.id,
        version: expectedVersion,
        ...(requireActivePredecessor
          ? { status: DecisionState.Decided, supersededById: null }
          : {}),
      },
      data: this.decisionData(decision),
    });
    return result.count === 1;
  }
}
