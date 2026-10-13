import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { ConflictError, NotFoundError, BadRequestError } from '../errors/AppError.js';

import {
  AnalysisDeliveryStatusDto,
  AnalysisDeliveryQueueDto,
  AnalysisRetryCommandDto,
} from '../dto/analysis-delivery.dto.js';
export type AnalysisDeliveryStatus = AnalysisDeliveryStatusDto;
const commandView = (command: {
  id: string;
  requestId: string;
  guildId: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
}): AnalysisRetryCommandDto => ({
  ...command,
  createdAt: command.createdAt.toISOString(),
  acknowledgedAt: command.acknowledgedAt?.toISOString() ?? null,
});

@Service()
export class AnalysisDeliveryService {
  constructor(private repo: DecisionRepository) {}

  async synchronize(requests: AnalysisDeliveryStatus[]): Promise<AnalysisRetryCommandDto[]> {
    const now = new Date();
    await this.repo.withTransaction(async tx => {
      await tx.analysisDeliveryHeartbeat.upsert({
        where: { id: 'bot' },
        create: { id: 'bot', synchronizedAt: now },
        update: { synchronizedAt: now },
      });
      for (const request of requests) {
        if (
          !request.requestId ||
          !request.guildId ||
          !Number.isInteger(request.attempts) ||
          request.attempts < 0 ||
          !Number.isFinite(request.nextAttemptAt)
        )
          throw new BadRequestError('Invalid queue status');
        const previous = await tx.analysisDelivery.findUnique({
          where: { requestId: request.requestId },
        });
        if (
          previous &&
          (previous.guildId !== request.guildId || previous.channelId !== request.channelId)
        )
          throw new ConflictError('Analysis Request scope changed');
        const { scanRange, ...status } = request;
        if (
          scanRange &&
          (![scanRange.afterMessageId, scanRange.startMessageId, scanRange.endMessageId].every(id =>
            /^\d+$/.test(id),
          ) ||
            BigInt(scanRange.afterMessageId) >= BigInt(scanRange.startMessageId) ||
            BigInt(scanRange.startMessageId) > BigInt(scanRange.endMessageId))
        )
          throw new BadRequestError('Invalid Scan Range');
        const data = {
          ...status,
          channelName: status.channelName ?? null,
          scanRangeJson: scanRange ? JSON.stringify(scanRange) : null,
          lastError: request.lastError ?? null,
          errorCategory: request.errorCategory ?? null,
          synchronizedAt: now,
        };
        await tx.analysisDelivery.upsert({
          where: { requestId: request.requestId },
          create: data,
          update: data,
        });
      }
    });
    return (
      await this.repo.prisma.analysisRetryCommand.findMany({
        where: { acknowledgedAt: null },
        orderBy: { createdAt: 'asc' },
      })
    ).map(commandView);
  }

  async list(guildId: string): Promise<AnalysisDeliveryQueueDto> {
    const requests = await this.repo.prisma.analysisDelivery.findMany({
      where: { guildId },
      orderBy: { synchronizedAt: 'desc' },
    });
    const heartbeat = await this.repo.prisma.analysisDeliveryHeartbeat.findUnique({
      where: { id: 'bot' },
    });
    return {
      requests: requests.map(r => ({
        ...r,
        channelName: r.channelName ?? undefined,
        scanRange: r.scanRangeJson ? JSON.parse(r.scanRangeJson) : undefined,
        status: r.status as AnalysisDeliveryStatus['status'],
        errorCategory: r.errorCategory ?? undefined,
        lastError: r.lastError ?? undefined,
        synchronizedAt: r.synchronizedAt.toISOString(),
      })),
      available:
        !!heartbeat &&
        Date.now() - heartbeat.synchronizedAt.getTime() < 15000 &&
        requests.every(r => Date.now() - r.synchronizedAt.getTime() < 15000),
      lastSynchronizedAt: heartbeat?.synchronizedAt.toISOString() ?? null,
    };
  }

  async retry(
    guildId: string,
    requestId: string,
    commandId: string,
  ): Promise<AnalysisRetryCommandDto> {
    if (!commandId.trim() || commandId.length > 200)
      throw new BadRequestError('Retry command ID is required');
    const command = await this.repo.withTransaction(async tx => {
      const existing = await tx.analysisRetryCommand.findUnique({ where: { id: commandId } });
      if (existing) {
        if (existing.guildId !== guildId || existing.requestId !== requestId)
          throw new ConflictError('Retry command ID already used');
        return existing;
      }
      const request = await tx.analysisDelivery.findFirst({ where: { guildId, requestId } });
      if (!request) throw new NotFoundError('Analysis Request not found');
      if (Date.now() - request.synchronizedAt.getTime() >= 15000)
        throw new ConflictError('Bot queue status is unavailable; wait for reconnection');
      if (request.status !== 'retained-failure')
        throw new ConflictError('Only retained failures can be retried');
      const pending = await tx.analysisRetryCommand.findFirst({
        where: { guildId, requestId, acknowledgedAt: null },
      });
      if (pending) return pending;
      return tx.analysisRetryCommand.create({ data: { id: commandId, guildId, requestId } });
    });
    return commandView(command);
  }

  async acknowledge(id: string) {
    await this.repo.prisma.analysisRetryCommand.updateMany({
      where: { id, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
  }
}
