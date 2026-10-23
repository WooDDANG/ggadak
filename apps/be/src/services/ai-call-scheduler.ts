import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { PrismaClient } from '@prisma/client';
import { AnalysisPolicy } from '@ggaddak/shared';
import { AiCallRepository } from '../repositories/ai-call.repository.js';
import { AppError } from '../errors/AppError.js';

export function concurrencySetting(key: string): number {
  const value = Number(process.env[key] ?? 1);
  if (!Number.isSafeInteger(value) || value < 1 || value > AnalysisPolicy.maxConcurrency)
    throw new Error(`${key} must be an integer between 1 and ${AnalysisPolicy.maxConcurrency}`);
  return value;
}

export interface AiCallPermit {
  signal: AbortSignal;
  waitMs: number;
  release(): Promise<void>;
}

/** FIFO admission shared across BE processes. No transaction is held during AI work. */
export class AiCallScheduler {
  private readonly repository: AiCallRepository;
  constructor(
    prisma: PrismaClient,
    private readonly limit = concurrencySetting('AI_CALL_CONCURRENCY'),
  ) {
    this.repository = new AiCallRepository(prisma);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > AnalysisPolicy.maxConcurrency)
      throw new Error('Invalid AI call concurrency');
  }

  async run<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const permit = await this.acquire(signal);
    try {
      return await work(permit.signal);
    } finally {
      await permit.release();
    }
  }

  async acquire(signal: AbortSignal): Promise<AiCallPermit> {
    const id = randomUUID(),
      started = Date.now();
    if (signal.aborted) throw new AppError('AI slot wait cancelled', 503);
    await this.repository.enqueue(id, this.limit);
    try {
      while (true) {
        if (signal.aborted) throw new AppError('AI slot wait cancelled', 503);
        const acquired = await this.repository.tryAcquire(id, this.limit);
        if (acquired) break;
        await delay(25, undefined, { signal });
      }
      const lost = new AbortController();
      let renewal = Promise.resolve();
      const timer = setInterval(() => {
        renewal = renewal
          .then(async () => {
            if (!(await this.repository.renew(id))) lost.abort();
          })
          .catch(() => {
            lost.abort();
          });
      }, AnalysisPolicy.leaseHeartbeatMs);
      timer.unref();
      return {
        signal: AbortSignal.any([signal, lost.signal]),
        waitMs: Date.now() - started,
        release: async () => {
          clearInterval(timer);
          await renewal;
          await this.repository.remove(id);
        },
      };
    } catch (error) {
      await this.repository.remove(id);
      if (signal.aborted) throw new AppError('AI slot wait cancelled', 503);
      throw error;
    }
  }
}
