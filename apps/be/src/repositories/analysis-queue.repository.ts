import { AnalysisReceiptState, DeliveryPolicy } from '@ggaddak/shared';

import { Prisma, PrismaClient } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
export type QueueTransaction = Prisma.TransactionClient;
export type ReceiptRecord = import('@prisma/client').AnalysisReceipt;

/** Queue persistence and fenced writes; services decide admission and transition policy. */
export class AnalysisQueueRepository extends BaseRepository {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }
  lock(tx: QueueTransaction) {
    return tx.analysisQueueControl.upsert({
      where: { id: 'queue' },
      create: { id: 'queue' },
      update: { revision: { increment: 1 } },
    });
  }
  receipt(id: string, tx: QueueTransaction = this.prisma) {
    return tx.analysisReceipt.findUnique({ where: { id } });
  }
  scan(id: string, tx: QueueTransaction = this.prisma) {
    return tx.analysisScan.findUnique({ where: { id } });
  }
  job(id: string, tx: QueueTransaction = this.prisma) {
    return tx.syncJob.findUnique({ where: { id } });
  }
  analysis(id: string, tx: QueueTransaction = this.prisma) {
    return tx.analysisRequest.findUnique({ where: { id } });
  }
  saveScan(data: Prisma.AnalysisScanUncheckedCreateInput, tx: QueueTransaction) {
    return tx.analysisScan.upsert({
      where: { id: data.id },
      create: data,
      update: { jobOwner: data.jobOwner },
    });
  }
  patchScan(id: string, data: Prisma.AnalysisScanUpdateInput, tx: QueueTransaction) {
    return tx.analysisScan.update({ where: { id }, data });
  }
  ranges(scanId: string, tx: QueueTransaction = this.prisma) {
    return tx.analysisReceipt.findMany({ where: { scanId }, orderBy: { rangeIndex: 'asc' } });
  }
  releaseRanges(scanId: string, tx: QueueTransaction) {
    return tx.analysisReceipt.updateMany({
      where: { scanId, state: AnalysisReceiptState.Receiving },
      data: { state: AnalysisReceiptState.Pending },
    });
  }
  usage(scanId: string | undefined, tx: QueueTransaction) {
    return tx.analysisReceipt.aggregate({
      where: scanId ? { scanId } : { inputJson: { not: null } },
      _sum: { inputBytes: true },
      _count: true,
    });
  }
  pendingCount(tx: QueueTransaction) {
    return tx.analysisReceipt.count({
      where: { state: { notIn: [AnalysisReceiptState.Completed, AnalysisReceiptState.Failed] } },
    });
  }
  async databaseFile(tx: QueueTransaction) {
    const files = await tx.$queryRawUnsafe<Array<{ file: string }>>('PRAGMA database_list');
    return files.find(f => f.file)?.file;
  }
  insert(data: Prisma.AnalysisReceiptUncheckedCreateInput, tx: QueueTransaction) {
    return tx.analysisReceipt.create({ data });
  }
  results(ids: string[]) {
    return this.prisma.analysisReceipt.findMany({ where: { id: { in: ids } } });
  }
  acknowledge(ids: string[], at: Date) {
    return this.prisma.analysisReceipt.updateMany({
      where: { id: { in: ids }, state: AnalysisReceiptState.Completed, acknowledgedAt: null },
      data: { acknowledgedAt: at },
    });
  }
  cleanupCandidates(cutoff: Date, tx: QueueTransaction, after?: string) {
    return tx.analysisReceipt.findMany({
      where: {
        state: AnalysisReceiptState.Completed,
        ...(after ? { id: { gt: after } } : {}),
        acknowledgedAt: { lte: cutoff },
        completedAt: { lte: cutoff },
        inputJson: { not: null },
      },
      take: DeliveryPolicy.cleanupBatchSize,
      orderBy: { id: 'asc' },
    });
  }
  checkpoint(channelId: string, tx: QueueTransaction) {
    return tx.channelCheckpoint.findUnique({ where: { channelId } });
  }
  retire(id: string, cutoff: Date, tx: QueueTransaction) {
    return tx.analysisReceipt.updateMany({
      where: { id, state: AnalysisReceiptState.Completed, acknowledgedAt: { lte: cutoff } },
      data: { inputJson: null, inputBytes: 0 },
    });
  }
  stats() {
    return this.prisma.analysisReceipt.groupBy({
      by: ['state'],
      _count: true,
      _sum: { inputBytes: true },
    });
  }
  oldest() {
    return this.prisma.analysisReceipt.findFirst({
      where: {
        state: {
          in: [
            AnalysisReceiptState.Pending,
            AnalysisReceiptState.Retry,
            AnalysisReceiptState.Receiving,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
  }
  control(tx: QueueTransaction = this.prisma) {
    return tx.analysisQueueControl.findUnique({ where: { id: 'queue' } });
  }
  patchControl(data: Prisma.AnalysisQueueControlUpdateInput, tx: QueueTransaction = this.prisma) {
    return tx.analysisQueueControl.update({ where: { id: 'queue' }, data });
  }
  eligible(now: Date, kind: 'any' | 'live' | 'scan', tx: QueueTransaction = this.prisma) {
    return tx.analysisReceipt.findFirst({
      where: {
        OR: [
          {
            state: { in: [AnalysisReceiptState.Pending, AnalysisReceiptState.Retry] },
            nextAttemptAt: { lte: now },
          },
          { state: AnalysisReceiptState.Processing, leaseUntil: { lte: now } },
        ],
        ...(kind === 'any' ? {} : { scanId: kind === 'live' ? null : { not: null } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  claim(id: string, owner: string, now: Date, leaseUntil: Date, tx: QueueTransaction) {
    return tx.analysisReceipt.update({
      where: { id },
      data: {
        state: AnalysisReceiptState.Processing,
        owner,
        leaseUntil,
        startedAt: now,
        attempts: { increment: 1 },
      },
    });
  }
  patchOwned(id: string, owner: string, data: Prisma.AnalysisReceiptUpdateManyMutationInput) {
    return this.prisma.analysisReceipt.updateMany({
      where: { id, owner, state: AnalysisReceiptState.Processing },
      data,
    });
  }
  coverage(channelId: string, tx: QueueTransaction) {
    return tx.analysisReceipt.findMany({
      where: { channelId, scanId: { not: null } },
      select: { state: true, rangeJson: true },
    });
  }
  saveCheckpoint(channelId: string, lastMessageId: string, at: Date, tx: QueueTransaction) {
    return tx.channelCheckpoint.upsert({
      where: { channelId },
      create: { channelId, lastMessageId },
      update: { lastMessageId, updatedAt: at },
    });
  }
  listForGuild(guildId: string) {
    return this.prisma.analysisReceipt.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: DeliveryPolicy.historyPageSize,
    });
  }
  acknowledgeRetry(id: string, guildId: string, requestId: string, at: Date, tx: QueueTransaction) {
    return tx.analysisRetryCommand.create({ data: { id, guildId, requestId, acknowledgedAt: at } });
  }
  resetFailed(id: string, tx: QueueTransaction) {
    return tx.analysisReceipt.update({
      where: { id },
      data: {
        state: AnalysisReceiptState.Pending,
        attempts: 0,
        nextAttemptAt: new Date(),
        errorCategory: null,
      },
    });
  }
}
