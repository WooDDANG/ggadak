import { randomUUID } from 'node:crypto';
import { AnalysisPolicy } from '@ggaddak/shared';
import type { AnalyzeDiscussionParams } from '../domain/analysis.js';
import type { AnalysisSession, AnalysisWorkflow } from '../domain/analysis-workflow.js';
import { hash } from '../domain/analysis-identity.js';
import { classifyAnalysisError } from '../errors/analysis-error.js';
import { NON_RETRYABLE_SESSION_FAILURES } from '../errors/ai-diagnostics.js';
import { DEFAULT_SEED } from '../domain/ai-call.js';
import { AnalysisRequestRepository } from '../repositories/analysis-request.repository.js';
import type { DecisionRepository } from '../repositories/decision.repository.js';
import type { DiscussionService } from './discussion.service.js';

export class AnalysisSessionRecovery {
  constructor(
    private readonly repo: DecisionRepository,
    private readonly discussion: DiscussionService,
    private readonly now = Date.now,
  ) {}

  async expireInputs(): Promise<void> {
    const now = new Date(this.now());
    await this.repo.prisma.$transaction(async tx => {
      const rows = await tx.analysisSessionRecovery.findMany({
        where: {
          expiresAt: { lte: now },
          purgedAt: null,
          OR: [{ owner: null }, { leaseUntil: { lte: now } }],
        },
        take: 100,
      });
      for (const row of rows) {
        const key = { requestId: row.requestId, sessionId: row.sessionId };
        await tx.analysisSessionRecovery.update({
          where: { requestId_sessionId: key },
          data: {
            state: row.state === 'recovered' ? 'recovered' : 'expired',
            purgedAt: now,
            owner: null,
            leaseUntil: null,
          },
        });
        await tx.analysisSessionState.updateMany({
          where: { requestId: row.requestId, id: row.sessionId },
          data: { inputJson: '{"messages":[],"transcript":""}' },
        });
        await tx.analysisRequest.update({
          where: { id: row.requestId },
          data: { inputJson: null },
        });
        await tx.analysisReceipt.updateMany({
          where: { id: row.requestId, state: 'completed' },
          data: { inputJson: null, inputBytes: 0 },
        });
        const attemptIds = Array.from(
          { length: row.attempts + 1 },
          (_, attempt) => 'recovery-' + hash({ ...key, attempt }),
        );
        const failedAttempts = await tx.analysisRequest.findMany({
          where: {
            id: { in: attemptIds },
            state: { in: ['pending', 'processing', 'terminal'] },
            OR: [{ owner: null }, { leaseUntil: { lte: now } }],
          },
          select: { id: true },
        });
        const ids = failedAttempts.map(attempt => attempt.id);
        await tx.analysisSessionState.updateMany({
          where: { requestId: { in: ids } },
          data: { inputJson: '{"messages":[],"transcript":""}' },
        });
        await tx.analysisRequest.updateMany({
          where: { id: { in: ids } },
          data: { inputJson: null },
        });
      }
    });
  }

  async runOnce(): Promise<void> {
    const db = this.repo.prisma.analysisSessionRecovery;
    const now = new Date(this.now());
    const due = {
      state: 'scheduled',
      nextAttemptAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ owner: null }, { leaseUntil: { lte: now } }],
    };
    const row = await db.findFirst({ where: due, orderBy: { nextAttemptAt: 'asc' } });
    if (!row) return;
    const key = { requestId: row.requestId, sessionId: row.sessionId };
    const owner = randomUUID();
    const leaseUntil = () => new Date(this.now() + AnalysisPolicy.leaseMs);
    const acquired = await db.updateMany({
      where: { ...key, ...due },
      data: { owner, leaseUntil: leaseUntil() },
    });
    if (!acquired.count) return;
    const controller = new AbortController();
    const expiry = setTimeout(
      () => controller.abort(),
      Math.min(2_147_483_647, Math.max(0, row.expiresAt.getTime() - this.now())),
    );
    expiry.unref();
    const heartbeat = setInterval(() => {
      void db
        .updateMany({ where: { ...key, owner }, data: { leaseUntil: leaseUntil() } })
        .then(result => {
          if (!result.count) controller.abort();
        })
        .catch(() => controller.abort());
    }, AnalysisPolicy.leaseHeartbeatMs);
    heartbeat.unref();
    try {
      const source = await new AnalysisRequestRepository(this.repo).get(row.requestId);
      if (!source?.inputJson || !source.workflowJson) {
        await db.updateMany({
          where: { ...key, owner },
          data: { state: 'exhausted', owner: null, leaseUntil: null },
        });
        return;
      }
      const params: AnalyzeDiscussionParams = JSON.parse(source.inputJson);
      const original: AnalysisWorkflow = JSON.parse(source.workflowJson);
      const session = original.sessions.find(item => item.id === row.sessionId);
      if (!session?.messages.length) throw new Error('복구 세션의 원본 입력이 없습니다.');
      const requestId = 'recovery-' + hash({ ...key, attempt: row.attempts });
      const fresh: AnalysisSession = {
        id: requestId + ':0',
        messages: session.messages,
        transcript: session.transcript,
        phase: 'extract',
        feedback: [],
        repairs: 0,
        elapsedMs: 0,
        calls: [],
        attempts: [],
        idMap: {},
      };
      await this.discussion.analyzeDiscussion(
        { ...params, requestId, rawMessages: fresh.messages, isManualOverride: false },
        {
          signal: controller.signal,
          initialWorkflow: {
            ...original,
            // 같은 seed면 같은 깨진 출력이 반복되기 쉽다. 시도 번호마다 바꾸되 재현 가능하게 둔다.
            settings: { ...original.settings, seed: DEFAULT_SEED + row.attempts + 1 },
            sessions: [fresh],
            skipped: false,
          },
          recovery: { ...key, owner },
        },
      );
      await db.updateMany({
        where: { ...key, owner },
        data: { state: 'recovered', owner: null, leaseUntil: null },
      });
    } catch (error) {
      const failure = classifyAnalysisError(error);
      // 소유권 상실은 분석 실패가 아니므로 시도로 세지 않는다.
      const notAnAttempt = failure.busy || failure.failureKind === 'lease-lost';
      const attempts = row.attempts + (notAnAttempt ? 0 : 1);
      const delay = Math.max(failure.retryAfterMs, notAnAttempt ? 1_000 : 300_000);
      const manualOnly =
        failure.failureKind !== undefined &&
        NON_RETRYABLE_SESSION_FAILURES.includes(failure.failureKind);
      await db.updateMany({
        where: { ...key, owner },
        data: {
          attempts,
          state:
            controller.signal.aborted && this.now() >= row.expiresAt.getTime()
              ? 'exhausted'
              : failure.status === 401 || failure.status === 403 || manualOnly || attempts >= 2
                ? 'exhausted'
                : 'scheduled',
          nextAttemptAt: new Date(this.now() + delay),
          ...(failure.failureKind && !notAnAttempt ? { failureKind: failure.failureKind } : {}),
          owner: null,
          leaseUntil: null,
        },
      });
    } finally {
      clearTimeout(expiry);
      clearInterval(heartbeat);
      await db.updateMany({
        where: { ...key, owner },
        data: { owner: null, leaseUntil: null },
      });
    }
  }
}
