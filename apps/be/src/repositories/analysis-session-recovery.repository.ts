import type { Prisma, PrismaClient } from '@prisma/client';
import {
  RecoveryState,
  type NewSessionRecovery,
  type RecoveryOwner,
  type SessionRecoveryKey,
  type SessionRecoveryRecord,
} from '../domain/session-recovery.js';

/** 만료로 지운 입력의 자리 표시. 세션 구조는 남기고 원문만 비운다. */
const PURGED_SESSION_INPUT = '{"messages":[],"transcript":""}';

/** 건너뛴 세션의 복구 기록에 대한 쿼리와 트랜잭션. 재시도 정책은 서비스가 정한다. */
export class AnalysisSessionRecoveryRepository {
  /** 트랜잭션 클라이언트를 받으면 그 트랜잭션 안에서 실행한다. */
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient) {}

  /** 이미 트랜잭션 안이면 그대로 쓰고, 아니면 새로 연다. */
  private transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return '$transaction' in this.db ? this.db.$transaction(work) : work(this.db);
  }

  forRequest(requestId: string): Promise<SessionRecoveryRecord[]> {
    return this.db.analysisSessionRecovery.findMany({ where: { requestId } });
  }

  forRequests(requestIds: string[], guildId: string): Promise<SessionRecoveryRecord[]> {
    return this.db.analysisSessionRecovery.findMany({
      where: { requestId: { in: requestIds }, guildId },
    });
  }

  get(key: SessionRecoveryKey): Promise<SessionRecoveryRecord | null> {
    return this.db.analysisSessionRecovery.findUnique({ where: { requestId_sessionId: key } });
  }

  /** 자동 재시도를 다 쓴 세션을 사람이 다시 예약한다. 실행 중이거나 만료된 세션은 거절한다. */
  async rescheduleExhausted(key: SessionRecoveryKey, guildId: string, now: Date) {
    const updated = await this.db.analysisSessionRecovery.updateMany({
      where: {
        ...key,
        guildId,
        state: RecoveryState.Exhausted,
        owner: null,
        expiresAt: { gt: now },
      },
      data: { state: RecoveryState.Scheduled, nextAttemptAt: now },
    });
    return updated.count > 0;
  }

  createForRequest(
    requestId: string,
    guildId: string,
    expiresAt: Date,
    recoveries: NewSessionRecovery[],
  ) {
    return this.db.analysisSessionRecovery.createMany({
      data: recoveries.map(recovery => ({ requestId, guildId, expiresAt, ...recovery })),
    });
  }

  /** 복구 소유권과 보관 기한이 유효할 때만 복구 완료를 확정한다. */
  async confirmRecovered(owner: RecoveryOwner, now: Date) {
    const recovered = await this.db.analysisSessionRecovery.updateMany({
      where: { ...owner, expiresAt: { gt: now }, leaseUntil: { gt: now } },
      data: { state: RecoveryState.Recovered, owner: null, leaseUntil: null },
    });
    return recovered.count > 0;
  }

  /** 가장 먼저 예정된 복구 하나를 소유한다. 다른 작업자가 먼저 잡으면 null이다. */
  async claimDue(now: Date, owner: string, leaseUntil: Date) {
    const due = {
      state: RecoveryState.Scheduled,
      nextAttemptAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ owner: null }, { leaseUntil: { lte: now } }],
    };
    const row = await this.db.analysisSessionRecovery.findFirst({
      where: due,
      orderBy: { nextAttemptAt: 'asc' },
    });
    if (!row) return null;
    const key = { requestId: row.requestId, sessionId: row.sessionId };
    const acquired = await this.db.analysisSessionRecovery.updateMany({
      where: { ...key, ...due },
      data: { owner, leaseUntil },
    });
    return acquired.count ? row : null;
  }

  async renewLease(owner: RecoveryOwner, leaseUntil: Date) {
    const renewed = await this.db.analysisSessionRecovery.updateMany({
      where: owner,
      data: { leaseUntil },
    });
    return renewed.count > 0;
  }

  /** 결과를 기록하지 않고 소유권만 놓는다. 이미 놓았다면 아무것도 바꾸지 않는다. */
  release(owner: RecoveryOwner) {
    return this.finish(owner);
  }

  /** 소유한 복구의 결과를 기록하고 소유권을 놓는다. */
  finish(
    owner: RecoveryOwner,
    data: {
      state?: RecoveryState;
      attempts?: number;
      nextAttemptAt?: Date;
      failureKind?: string;
    } = {},
  ) {
    return this.db.analysisSessionRecovery.updateMany({
      where: owner,
      data: { ...data, owner: null, leaseUntil: null },
    });
  }

  /**
   * 보관 기한이 지난 복구의 입력 원문을 지운다. 최초 요청과, 아직 끝나지 않았거나 실패한
   * 복구 시도 요청의 입력을 함께 지운다. 시도 요청 ID는 서비스가 정한다.
   */
  purgeExpiredInputs(
    now: Date,
    attemptRequestIds: (recovery: SessionRecoveryRecord) => string[],
    limit = 100,
  ) {
    return this.transaction(async tx => {
      const rows = await tx.analysisSessionRecovery.findMany({
        where: {
          expiresAt: { lte: now },
          purgedAt: null,
          OR: [{ owner: null }, { leaseUntil: { lte: now } }],
        },
        take: limit,
      });
      for (const row of rows) {
        const key = { requestId: row.requestId, sessionId: row.sessionId };
        await tx.analysisSessionRecovery.update({
          where: { requestId_sessionId: key },
          data: {
            state:
              row.state === RecoveryState.Recovered
                ? RecoveryState.Recovered
                : RecoveryState.Expired,
            purgedAt: now,
            owner: null,
            leaseUntil: null,
          },
        });
        await tx.analysisSessionState.updateMany({
          where: { requestId: row.requestId, id: row.sessionId },
          data: { inputJson: PURGED_SESSION_INPUT },
        });
        await tx.analysisRequest.update({
          where: { id: row.requestId },
          data: { inputJson: null },
        });
        await tx.analysisReceipt.updateMany({
          where: { id: row.requestId, state: 'completed' },
          data: { inputJson: null, inputBytes: 0 },
        });
        const unfinished = await tx.analysisRequest.findMany({
          where: {
            id: { in: attemptRequestIds(row) },
            state: { in: ['pending', 'processing', 'terminal'] },
            OR: [{ owner: null }, { leaseUntil: { lte: now } }],
          },
          select: { id: true },
        });
        const ids = unfinished.map(attempt => attempt.id);
        await tx.analysisSessionState.updateMany({
          where: { requestId: { in: ids } },
          data: { inputJson: PURGED_SESSION_INPUT },
        });
        await tx.analysisRequest.updateMany({
          where: { id: { in: ids } },
          data: { inputJson: null },
        });
      }
    });
  }
}
