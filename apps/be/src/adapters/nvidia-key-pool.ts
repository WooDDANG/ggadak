import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../errors/AppError.js';
import { AnalysisBusyError } from '../errors/analysis-error.js';
import type { NvidiaCredential } from '../config/nvidia-credentials.js';

const LEASE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
const WINDOW_MS = 60_000;

function credentialId(credential: NvidiaCredential): string {
  return createHash('sha256').update(credential.apiKey).digest('hex');
}

/** 403 뒤 키를 다시 쓰기까지 기다리는 시간. */
const FORBIDDEN_COOLDOWN_MS = 60 * 60 * 1000;
export function nvidiaRetryAfterMs(error: unknown, now = Date.now()): number {
  const headers = (error as { headers?: Headers | Record<string, string> } | null)?.headers;
  const value =
    headers &&
    ('get' in headers && typeof headers.get === 'function'
      ? headers.get('retry-after')
      : (headers as Record<string, string>)['retry-after']);
  if (!value?.trim()) return WINDOW_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return seconds >= 0 && Number.isSafeInteger(Math.ceil(seconds * 1000))
      ? Math.ceil(seconds * 1000)
      : WINDOW_MS;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : WINDOW_MS;
}

export interface NvidiaReservation extends NvidiaCredential {
  owner: string;
  signal: AbortSignal;
  release(): Promise<void>;
}

/** 공유 저장소에서 키 잠금과 최근 60초 호출 예산을 원자적으로 예약한다. */
export class NvidiaKeyPool {
  private readonly keys: Map<string, NvidiaCredential>;

  constructor(
    private readonly prisma: PrismaClient,
    credentials: NvidiaCredential[],
    private readonly requestsPerMinute = 40,
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
  }

  async reserve(signal: AbortSignal): Promise<NvidiaReservation> {
    if (signal.aborted) throw new AppError('NVIDIA reservation cancelled', 503);
    const ids = [...this.keys.keys()];
    const owner = randomUUID();
    let now = this.now();
    const selected = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT OR IGNORE INTO "NvidiaAccountBudget"
          ("id", "nextRequestAt", "cooldownUntil", "disabled", "lastSelectedAt", "leaseUntil")
        VALUES ${Prisma.join(ids.map(id => Prisma.sql`(${id}, 0, 0, 0, 0, 0)`))}
      `;
      // 쓰기 잠금을 얻기까지 기다린 시간은 예약의 유효 기간에서 제외한다.
      now = this.now();
      await tx.$executeRaw`DELETE FROM "NvidiaAccountRequest" WHERE "startedAt" <= ${now - WINDOW_MS}`;
      if (signal.aborted) throw new AppError('NVIDIA reservation cancelled', 503);
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "NvidiaAccountBudget"
        SET "leaseOwner" = ${owner}, "leaseUntil" = ${now + LEASE_MS}, "lastSelectedAt" = ${now}
        WHERE "id" = (
          SELECT b."id" FROM "NvidiaAccountBudget" b
          WHERE b."id" IN (${Prisma.join(ids)}) AND b."disabled" = 0
            AND b."nextRequestAt" <= ${now} AND b."cooldownUntil" <= ${now}
            AND b."leaseUntil" <= ${now}
            AND (SELECT COUNT(*) FROM "NvidiaAccountRequest" r
                 WHERE r."accountId" = b."id" AND r."startedAt" > ${now - WINDOW_MS}) < ${this.requestsPerMinute}
          ORDER BY b."lastSelectedAt", b."id" LIMIT 1
        ) RETURNING "id"
      `;
      if (rows[0]) {
        await tx.$executeRaw`INSERT INTO "NvidiaAccountRequest" ("id", "accountId", "startedAt") VALUES (${owner}, ${rows[0].id}, ${now})`;
      }
      return rows[0]?.id;
    });
    if (!selected) {
      const rows = await this.prisma.$queryRaw<
        {
          id: string;
          cooldownUntil: number;
          forbiddenUntil: number;
          nextRequestAt: number;
          leaseUntil: number;
        }[]
      >`
        SELECT "id", "cooldownUntil", "forbiddenUntil", "nextRequestAt", "leaseUntil" FROM "NvidiaAccountBudget"
        WHERE "id" IN (${Prisma.join(ids)}) AND "disabled" = 0
      `;
      if (!rows.length)
        throw new AppError('All NVIDIA API keys failed authentication', 401, {
          failureKind: 'auth',
        });
      // 남은 키가 모두 403으로 쉬는 중이면 기다려도 설정을 고치기 전에는 풀리지 않는다.
      if (rows.every(row => row.forbiddenUntil > now))
        throw new AppError('All NVIDIA API keys lack permission for the requested model', 403, {
          failureKind: 'auth',
          retryAfterMs: Math.min(...rows.map(row => row.forbiddenUntil)) - now,
        });
      const waits = await Promise.all(
        rows.map(async row => {
          const requests = await this.prisma.$queryRaw<{ startedAt: number }[]>`
          SELECT "startedAt" FROM "NvidiaAccountRequest"
          WHERE "accountId" = ${row.id} AND "startedAt" > ${now - WINDOW_MS}
          ORDER BY "startedAt" ASC LIMIT 1
        `;
          const counts = await this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS "count" FROM "NvidiaAccountRequest"
          WHERE "accountId" = ${row.id} AND "startedAt" > ${now - WINDOW_MS}
        `;
          const quota =
            Number(counts[0].count) >= this.requestsPerMinute
              ? requests[0].startedAt + WINDOW_MS
              : now;
          const lease = row.leaseUntil > now ? now + 500 : now;
          return Math.max(row.cooldownUntil, row.nextRequestAt, quota, lease) - now;
        }),
      );
      throw new AnalysisBusyError(
        'NVIDIA account budgets are waiting',
        Math.max(1, Math.min(...waits)),
      );
    }
    const lost = new AbortController();
    let renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = renewal
        .then(async () => {
          const changed = await this.prisma.$executeRaw`
          UPDATE "NvidiaAccountBudget" SET "leaseUntil" = ${this.now() + LEASE_MS}
          WHERE "id" = ${selected} AND "leaseOwner" = ${owner} AND "leaseUntil" > ${this.now()}
        `;
          if (!changed) lost.abort();
        })
        .catch(() => lost.abort());
    }, HEARTBEAT_MS);
    timer.unref();
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      clearInterval(timer);
      await renewal;
      await this.prisma.$executeRaw`
        UPDATE "NvidiaAccountBudget" SET "leaseOwner" = NULL, "leaseUntil" = 0
        WHERE "id" = ${selected} AND "leaseOwner" = ${owner}
      `;
    };
    if (signal.aborted) {
      await release();
      throw new AppError('NVIDIA reservation cancelled', 503);
    }
    return {
      ...this.keys.get(selected)!,
      owner,
      signal: AbortSignal.any([signal, lost.signal]),
      release,
    };
  }

  async recordFailure(
    key: NvidiaReservation,
    status: number,
    retryAfterMs = 60_000,
  ): Promise<void> {
    if (status === 401) {
      await this.prisma
        .$executeRaw`UPDATE "NvidiaAccountBudget" SET "disabled" = 1 WHERE "id" = ${credentialId(key)} AND "leaseOwner" = ${key.owner}`;
    } else if (status === 403) {
      // 403은 모델 권한 부족에도 나온다. 설정을 고치면 키가 저절로 돌아오도록 쉬게만 한다.
      await this.prisma.$executeRaw`
        UPDATE "NvidiaAccountBudget"
        SET "cooldownUntil" = MAX("cooldownUntil", ${this.now() + FORBIDDEN_COOLDOWN_MS}),
            "forbiddenUntil" = MAX("forbiddenUntil", ${this.now() + FORBIDDEN_COOLDOWN_MS})
        WHERE "id" = ${credentialId(key)} AND "leaseOwner" = ${key.owner}
      `;
    } else if (status === 429) {
      await this.prisma.$executeRaw`
        UPDATE "NvidiaAccountBudget" SET "cooldownUntil" = MAX("cooldownUntil", ${this.now() + retryAfterMs})
        WHERE "id" = ${credentialId(key)} AND "leaseOwner" = ${key.owner}
      `;
    }
  }
}
