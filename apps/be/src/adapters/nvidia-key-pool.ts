import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { AnalysisBusyError } from '../errors/analysis-error.js';
import { createLogger } from '@ggaddak/shared';
import type { NvidiaCredential } from '../config/nvidia-credentials.js';

const logger = createLogger('BE-NVIDIA');

function credentialId(credential: NvidiaCredential): string {
  return createHash('sha256').update(credential.apiKey).digest('hex');
}

/** 키 원문 없이 계정별 예약과 장애 상태를 SQLite에서 공유한다. */
export class NvidiaKeyPool {
  private readonly keys: Map<string, NvidiaCredential>;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    credentials: NvidiaCredential[],
    requestsPerMinute = 40,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isSafeInteger(requestsPerMinute) ||
      requestsPerMinute < 1 ||
      requestsPerMinute > 60_000
    )
      throw new AppError('Invalid NVIDIA_REQUESTS_PER_MINUTE; expected integer 1..60000', 422);
    this.keys = new Map(credentials.map(key => [credentialId(key), key]));
    if (!this.keys.size) throw new AppError('NVIDIA API keys are not configured', 422);
    this.intervalMs = Math.ceil(60_000 / requestsPerMinute);
  }

  async reserve(signal: AbortSignal): Promise<NvidiaCredential> {
    if (signal.aborted) throw new AppError('NVIDIA reservation cancelled', 503);
    const ids = [...this.keys.keys()];
    await this.prisma.$executeRaw`
      INSERT OR IGNORE INTO "NvidiaAccountBudget"
        ("id", "nextRequestAt", "cooldownUntil", "disabled", "lastSelectedAt")
      VALUES ${Prisma.join(ids.map(id => Prisma.sql`(${id}, 0, 0, 0, 0)`))}
    `;
    if (signal.aborted) throw new AppError('NVIDIA reservation cancelled', 503);
    const now = this.now();
    // 선택과 예약을 단일 UPDATE로 확정해 프로세스 간 경합을 막는다.
    const selected = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "NvidiaAccountBudget"
      SET "nextRequestAt" = ${now + this.intervalMs}, "lastSelectedAt" = ${now}
      WHERE "id" = (
        SELECT "id" FROM "NvidiaAccountBudget"
        WHERE "id" IN (${Prisma.join(ids)}) AND "disabled" = 0
          AND "nextRequestAt" <= ${now} AND "cooldownUntil" <= ${now}
        ORDER BY "lastSelectedAt", "id" LIMIT 1
      ) RETURNING "id"
    `;
    if (selected[0]) return this.keys.get(selected[0].id)!;
    const rows = await this.prisma.$queryRaw<{ nextAt: number | null }[]>`
      SELECT MIN(MAX("nextRequestAt", "cooldownUntil")) AS "nextAt"
      FROM "NvidiaAccountBudget"
      WHERE "id" IN (${Prisma.join(ids)}) AND "disabled" = 0
    `;
    if (rows[0]?.nextAt == null)
      throw new AppError('All NVIDIA API keys failed authentication', 401);
    const retryAfterMs = Math.max(1, rows[0].nextAt - now);
    logger.info('nvidia.key.waiting', { retryAfterMs });
    throw new AnalysisBusyError('NVIDIA account budgets are waiting', retryAfterMs);
  }

  async recordFailure(key: NvidiaCredential, status: number, retryAfterMs = 60_000): Promise<void> {
    if (status === 401 || status === 403) {
      await this.prisma.$executeRaw`
        UPDATE "NvidiaAccountBudget" SET "disabled" = 1 WHERE "id" = ${credentialId(key)}
      `;
    } else if (status === 429) {
      await this.prisma.$executeRaw`
        UPDATE "NvidiaAccountBudget"
        SET "cooldownUntil" = MAX("cooldownUntil", ${this.now() + retryAfterMs})
        WHERE "id" = ${credentialId(key)}
      `;
    }
  }
}
