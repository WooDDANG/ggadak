import {
  AnalysisReceiptState,
  AnalysisScanState,
  parseReceiptState,
  parseScanState,
} from '@ggaddak/shared';
import { randomUUID } from 'node:crypto';
import {
  AnalysisQueueRepository,
  type QueueTransaction,
  type ReceiptRecord,
} from '../repositories/analysis-queue.repository.js';
import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';
import { hash } from '../repositories/analysis-request.repository.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../errors/AppError.js';
import { AnalyzeDiscussionRequestDtoSchema } from '../dto/discussion.dto.js';
import type {
  ReceiptBody,
  ReceiptView,
  ScanBody,
  ScanRangeDto,
} from '../dto/analysis-queue.dto.js';
import { DiscussionService } from './discussion.service.js';
import { SyncJobService } from './sync-job.service.js';

export interface QueueOptions {
  maxBytes: number;
  maxRequestBytes: number;
  maxMessages: number;
  maxPending: number;
  maxChannelBytes: number;
  minFreeBytes: number;
  maxAttempts: number;
  retryMs: number;
  leaseMs: number;
  retentionMs: number;
  foregroundBurst: number;
}
function positive(name: string, fallback: number) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ${name}`);
  return n;
}
const view = (r: ReceiptRecord): ReceiptView => ({
  requestId: r.id,
  state: parseReceiptState(r.state),
  attempts: r.attempts,
  nextAttemptAt: r.nextAttemptAt.toISOString(),
  errorCategory: r.errorCategory,
  inputRetained: r.inputJson !== null,
  receivedAt: r.createdAt.toISOString(),
  startedAt: r.startedAt?.toISOString() ?? null,
  completedAt: r.completedAt?.toISOString() ?? null,
});
@Service()
export class AnalysisQueueService {
  readonly options: QueueOptions;
  private running = false;
  private cleanupCursor?: string;
  private storage: AnalysisQueueRepository;
  constructor(
    private repo: DecisionRepository,
    private discussion: DiscussionService,
    options: Partial<QueueOptions> = {},
    private now = Date.now,
  ) {
    this.storage = new AnalysisQueueRepository(repo.prisma);
    this.options = {
      maxBytes: positive('ANALYSIS_QUEUE_MAX_BYTES', 256 * 1024 * 1024),
      maxRequestBytes: positive('ANALYSIS_QUEUE_REQUEST_BYTES', 256 * 1024),
      maxChannelBytes: positive('ANALYSIS_QUEUE_CHANNEL_BYTES', 64 * 1024 * 1024),
      maxPending: positive('ANALYSIS_QUEUE_MAX_PENDING', 2000),
      maxMessages: 100,
      minFreeBytes: positive('ANALYSIS_QUEUE_MIN_FREE_BYTES', 64 * 1024 * 1024),
      maxAttempts: positive('ANALYSIS_MAX_ATTEMPTS', 5),
      retryMs: positive('ANALYSIS_RETRY_DELAY_MS', 5000),
      leaseMs: 60000,
      retentionMs: positive('ANALYSIS_COMPLETED_RETENTION_MS', 7 * 86400000),
      foregroundBurst: positive('ANALYSIS_FOREGROUND_BURST', 5),
      ...options,
    };
  }
  private async lock(tx: QueueTransaction) {
    return this.storage.lock(tx);
  }
  private async scanOwner(
    tx: QueueTransaction,
    scan: { jobId: string | null; jobOwner: string | null; channelId: string },
  ) {
    if (!scan.jobId) return;
    const job = await this.storage.job(scan.jobId, tx);
    if (
      !job ||
      job.owner !== scan.jobOwner ||
      job.status !== 'PROCESSING' ||
      !job.leaseUntil ||
      job.leaseUntil.getTime() <= this.now()
    )
      throw new ConflictError('Scan worker lost its lease');
  }
  async startScan(body: ScanBody) {
    if (
      !body.id ||
      !body.guildId ||
      !body.channelId ||
      !/^\d+$/.test(body.upperMessageId) ||
      !/^\d+$/.test(body.afterMessageId) ||
      BigInt(body.afterMessageId) > BigInt(body.upperMessageId)
    )
      throw new BadRequestError('Invalid scan bounds');
    return this.storage.withTransaction(async tx => {
      await this.lock(tx);
      const existing = await this.storage.scan(body.id, tx);
      if (
        existing &&
        (existing.guildId !== body.guildId ||
          existing.channelId !== body.channelId ||
          existing.upperMessageId !== body.upperMessageId ||
          existing.afterMessageId !== body.afterMessageId ||
          existing.jobId !== (body.jobId ?? null))
      )
        throw new ConflictError('Scan identity already used');
      if (body.jobId) {
        const job = await this.storage.job(body.jobId, tx);
        if (!job || job.guildId !== body.guildId) throw new ConflictError('Invalid scan job');
        const results = JSON.parse(job.channelResultsJson);
        const current = (JSON.parse(job.channelIdsJson) as string[]).find(id => !results[id]);
        if (current !== body.channelId && !existing)
          throw new ConflictError('Channel is not the current transfer');
      }
      await this.scanOwner(tx, {
        jobId: body.jobId ?? null,
        jobOwner: body.jobOwner ?? null,
        channelId: body.channelId,
      });
      const saved = await this.storage.saveScan(body, tx);
      return { ...saved, state: parseScanState(saved.state) };
    });
  }
  async sealScan(id: string, expectedRanges: number) {
    if (
      !Number.isSafeInteger(expectedRanges) ||
      expectedRanges < 0 ||
      expectedRanges > this.options.maxPending
    )
      throw new BadRequestError('Invalid range count');
    return this.storage.withTransaction(async tx => {
      await this.lock(tx);
      const scan = await this.storage.scan(id, tx);
      if (!scan) throw new NotFoundError('Scan not found');
      await this.scanOwner(tx, scan);
      if (scan.expectedRanges !== null && scan.expectedRanges !== expectedRanges)
        throw new ConflictError('Scan manifest changed');
      const rows = await this.storage.ranges(id, tx);
      if (rows.some(r => r.rangeIndex! >= expectedRanges))
        throw new ConflictError('Unexpected scan range');
      const received = new Set(rows.map(r => r.rangeIndex)),
        missing = Array.from({ length: expectedRanges }, (_, i) => i).filter(i => !received.has(i));
      await this.storage.patchScan(id, { expectedRanges }, tx);
      if (missing.length) return { sealed: false, missing };
      let end = scan.afterMessageId;
      for (const row of rows) {
        const range = JSON.parse(row.rangeJson!) as ScanRangeDto;
        if (range.afterMessageId !== end) throw new ConflictError('Scan coverage has a gap');
        end = range.endMessageId;
      }
      if (expectedRanges && end !== scan.upperMessageId)
        throw new ConflictError('Scan upper bound was not received');
      await this.storage.patchScan(id, { state: AnalysisScanState.Sealed }, tx);
      await this.storage.releaseRanges(id, tx);
      return { sealed: true, missing };
    });
  }
  async scanStatus(id: string) {
    const scan = await this.storage.scan(id);
    if (!scan) throw new NotFoundError('Scan not found');
    const rows = await this.storage.ranges(id);
    return {
      id: scan.id,
      state: parseScanState(scan.state),
      expectedRanges: scan.expectedRanges,
      receivedRanges: rows.length,
      completed: rows.filter(r => r.state === AnalysisReceiptState.Completed).length,
      failed: rows.filter(r => r.state === AnalysisReceiptState.Failed).length,
      bytes: rows.reduce((sum, r) => sum + r.inputBytes, 0),
      missing:
        scan.expectedRanges === null
          ? []
          : Array.from({ length: scan.expectedRanges }, (_, i) => i).filter(
              i => !rows.some(r => r.rangeIndex === i),
            ),
    };
  }
  async receive(body: ReceiptBody): Promise<ReceiptView> {
    const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(body.input);
    if (!parsed.success || !parsed.data.guildId || !parsed.data.channelId)
      throw new BadRequestError('Invalid discussion payload');
    const input = parsed.data;
    const { traceId: _trace, requestId: id, ...identity } = input;
    const fingerprint = hash(identity);
    const inputJson = JSON.stringify(input),
      bytes = Buffer.byteLength(inputJson);
    if (bytes > this.options.maxRequestBytes || input.rawMessages.length > this.options.maxMessages)
      throw new AppError('Discussion segment exceeds receive limit', 413);
    const result = await this.storage.withTransaction(async tx => {
      const control = await this.lock(tx);
      const existing = await this.storage.receipt(id, tx);
      if (existing) {
        if (
          existing.fingerprint !== fingerprint ||
          existing.scanId !== (body.scanId ?? null) ||
          existing.rangeIndex !== (body.rangeIndex ?? null) ||
          existing.rangeJson !== (body.range ? JSON.stringify(body.range) : null)
        )
          throw new ConflictError('Request identity already used');
        return existing;
      }
      if (body.scanId) {
        const scan = await this.storage.scan(body.scanId, tx);
        if (!scan || scan.guildId !== input.guildId || scan.channelId !== input.channelId)
          throw new ConflictError('Scan scope mismatch');
        await this.scanOwner(tx, scan);
        if (scan.state === AnalysisScanState.Sealed) throw new ConflictError('Scan already sealed');
        const range = body.range,
          ids = input.rawMessages.map(m => m.id);
        if (
          !Number.isSafeInteger(body.rangeIndex) ||
          body.rangeIndex! < 0 ||
          !range ||
          ![range.afterMessageId, range.startMessageId, range.endMessageId, ...ids].every(v =>
            /^\d+$/.test(v),
          ) ||
          range.startMessageId !== ids[0] ||
          range.endMessageId !== ids.at(-1) ||
          BigInt(range.afterMessageId) >= BigInt(range.startMessageId) ||
          BigInt(range.endMessageId) > BigInt(scan.upperMessageId) ||
          ids.some((v, i) => i > 0 && BigInt(v) <= BigInt(ids[i - 1]))
        )
          throw new BadRequestError('Invalid scan range');
        if (scan.expectedRanges !== null && body.rangeIndex! >= scan.expectedRanges)
          throw new ConflictError('Unexpected scan range');
        const usage = await this.storage.usage(body.scanId, tx);
        if (
          (usage._sum.inputBytes ?? 0) + bytes >
            Math.min(this.options.maxChannelBytes, Math.floor(this.options.maxBytes * 0.9)) ||
          usage._count >= Math.max(1, Math.floor(this.options.maxPending * 0.9))
        ) {
          await this.storage.patchScan(
            body.scanId,
            { state: AnalysisScanState.CapacityExceeded },
            tx,
          );
          return null;
        }
        if (scan.state === AnalysisScanState.CapacityExceeded)
          await this.storage.patchScan(body.scanId, { state: AnalysisScanState.Receiving }, tx);
      } else if (body.range || body.rangeIndex !== undefined)
        throw new BadRequestError('Range requires scan');
      const usage = await this.storage.usage(undefined, tx);
      const byteLimit = body.scanId
        ? Math.floor(this.options.maxBytes * 0.9)
        : this.options.maxBytes;
      const countLimit = body.scanId
        ? Math.max(1, Math.floor(this.options.maxPending * 0.9))
        : this.options.maxPending;
      if ((usage._sum.inputBytes ?? 0) + bytes > byteLimit)
        throw new AppError('Receive storage is full; retry after capacity is available', 429, {
          retryAfterMs: 5000,
        });
      if ((await this.storage.pendingCount(tx)) >= countLimit)
        throw new AppError('Analysis queue is full', 429, { retryAfterMs: 5000 });
      if (body.scanId && control.pauseUntil && control.pauseUntil.getTime() > this.now())
        throw new AppError('Scan paused by provider overload', 429);
      const file = await this.storage.databaseFile(tx);
      if (file) {
        const disk = await statfs(dirname(file));
        if (disk.bavail * disk.bsize < bytes + this.options.minFreeBytes)
          throw new AppError('Receive disk capacity unavailable', 507);
      }
      const legacy = await this.storage.analysis(id, tx);
      if (legacy && legacy.fingerprint !== fingerprint)
        throw new ConflictError('Request identity already used');
      return this.storage.insert(
        {
          id,
          fingerprint,
          guildId: input.guildId!,
          channelId: input.channelId!,
          inputJson,
          inputBytes: bytes,
          createdAt: new Date(this.now()),
          nextAttemptAt: new Date(this.now()),
          scanId: body.scanId,
          rangeIndex: body.rangeIndex,
          rangeJson: body.range ? JSON.stringify(body.range) : null,
          state:
            legacy?.state === AnalysisReceiptState.Completed
              ? AnalysisReceiptState.Completed
              : body.scanId
                ? AnalysisReceiptState.Receiving
                : AnalysisReceiptState.Pending,
          completedAt: legacy?.state === AnalysisReceiptState.Completed ? legacy.completedAt : null,
        },
        tx,
      );
    });
    if (!result)
      throw new AppError('Channel receive capacity exceeded; adjust limits before resuming', 413);
    return view(result);
  }
  async results(ids: string[]): Promise<ReceiptView[]> {
    if (ids.length > 100) throw new BadRequestError('At most 100 request IDs');
    const rows = await this.storage.results(ids);
    return Promise.all(
      rows.map(async r => {
        const analysis = await this.storage.analysis(r.id);
        return {
          ...view(r),
          ...(r.state === AnalysisReceiptState.Completed && analysis?.resultJson
            ? { result: JSON.parse(analysis.resultJson) }
            : {}),
        };
      }),
    );
  }
  async acknowledge(ids: string[]) {
    if (ids.length > 100) throw new BadRequestError('At most 100 result acknowledgements');
    await this.storage.acknowledge(ids, new Date(this.now()));
  }
  async cleanup() {
    return this.storage.withTransaction(async tx => {
      await this.lock(tx);
      const cutoff = new Date(this.now() - this.options.retentionMs);
      let rows = await this.storage.cleanupCandidates(cutoff, tx, this.cleanupCursor);
      if (!rows.length && this.cleanupCursor)
        rows = await this.storage.cleanupCandidates(cutoff, tx);
      this.cleanupCursor = rows.at(-1)?.id;
      let bytes = 0;
      for (const row of rows) {
        if (row.rangeJson) {
          const checkpoint = await this.storage.checkpoint(row.channelId, tx);
          if (
            !checkpoint ||
            BigInt(checkpoint.lastMessageId) < BigInt(JSON.parse(row.rangeJson).endMessageId)
          )
            continue;
        }
        // AnalysisRequest retains graph/evidence/reanalysis input; only the acknowledged transfer copy is disposable.
        const saved = await this.storage.retire(row.id, cutoff, tx);
        if (saved.count) bytes += row.inputBytes;
      }
      return { reclaimedBytes: bytes };
    });
  }
  async metrics() {
    const grouped = await this.storage.stats();
    const oldest = await this.storage.oldest();
    const control = await this.storage.control();
    const retainedBytes = grouped.reduce((n, g) => n + (g._sum.inputBytes ?? 0), 0),
      pending = grouped
        .filter(
          g =>
            g.state !== AnalysisReceiptState.Completed && g.state !== AnalysisReceiptState.Failed,
        )
        .reduce((n, g) => n + g._count, 0);
    return {
      pending,
      retainedBytes,
      acceptingScans:
        (!control?.pauseUntil || control.pauseUntil.getTime() <= this.now()) &&
        retainedBytes < Math.floor(this.options.maxBytes * 0.9) &&
        pending < Math.max(1, Math.floor(this.options.maxPending * 0.9)),
      states: grouped.map(g => ({
        state: parseReceiptState(g.state),
        count: g._count,
        bytes: g._sum.inputBytes ?? 0,
      })),
      oldestWaitingMs: oldest ? Math.max(0, this.now() - oldest.createdAt.getTime()) : 0,
      pauseUntil: control?.pauseUntil?.toISOString() ?? null,
      maxBytes: this.options.maxBytes,
      maxChannelBytes: this.options.maxChannelBytes,
      maxPending: this.options.maxPending,
    };
  }
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const owner = randomUUID(),
      now = new Date(this.now());
    let selected: ReceiptRecord | null = null;
    try {
      const work = await this.storage.eligible(now, 'any');
      if (!work) return;
      selected = await this.storage.withTransaction(async tx => {
        const control = await this.lock(tx);
        const live = await this.storage.eligible(now, 'live', tx);
        const scan =
          !control.pauseUntil || control.pauseUntil <= now
            ? await this.storage.eligible(now, 'scan', tx)
            : null;
        const r =
          live && (!scan || control.foregroundCount < this.options.foregroundBurst) ? live : scan;
        if (!r) return null;
        await this.storage.patchControl(
          { foregroundCount: r.scanId ? 0 : control.foregroundCount + 1 },
          tx,
        );
        await this.storage.claim(r.id, owner, now, new Date(this.now() + this.options.leaseMs), tx);
        return r;
      });
      if (!selected) return;
      const r = selected;
      const heartbeat = setInterval(() => {
        void this.storage
          .patchOwned(r.id, owner, { leaseUntil: new Date(this.now() + this.options.leaseMs) })
          .catch(() => {});
      }, this.options.leaseMs / 3);
      heartbeat.unref();
      try {
        if (!r.inputJson) throw new Error('Retained analysis input missing');
        await this.discussion.analyzeDiscussion(JSON.parse(r.inputJson));
        await this.storage.patchOwned(r.id, owner, {
          state: AnalysisReceiptState.Completed,
          owner: null,
          leaseUntil: null,
          completedAt: new Date(this.now()),
          errorCategory: null,
        });
      } catch (error) {
        const busy =
          error instanceof Error &&
          [
            'Analysis capacity busy',
            'Analysis is already in progress; retry this request',
          ].includes(error.message);
        const status =
          (error as { statusCode?: number; status?: number }).statusCode ??
          (error as { status?: number }).status ??
          500;
        const attempts = r.attempts + (busy ? 0 : 1),
          retryable = status >= 500 || status === 429 || status === 408;
        const base = Math.min(
          300000,
          this.options.retryMs * 2 ** Math.min(Math.max(0, attempts - 1), 6),
        );
        const retryAfter = Number((error as AppError).details?.retryAfterMs ?? 0);
        const delay = Math.max(
          Math.round(base * (0.8 + Math.random() * 0.4)),
          Number.isFinite(retryAfter) ? retryAfter : 0,
        );
        await this.storage.patchOwned(r.id, owner, {
          state:
            retryable && attempts < this.options.maxAttempts
              ? AnalysisReceiptState.Retry
              : AnalysisReceiptState.Failed,
          attempts,
          owner: null,
          leaseUntil: null,
          nextAttemptAt: new Date(this.now() + (busy ? 500 : delay)),
          errorCategory: busy
            ? 'analysis-capacity'
            : retryable
              ? 'provider-or-storage'
              : 'analysis-terminal',
        });
        if (retryable && !busy)
          await this.storage.patchControl({ pauseUntil: new Date(this.now() + delay) });
      } finally {
        clearInterval(heartbeat);
      }
      if (r.scanId) await this.advanceCoverage(r.channelId);
      if (r.scanId) {
        const scan = await this.storage.scan(r.scanId);
        if (scan?.jobId) await new SyncJobService(this.repo).reconcile(scan.jobId);
      }
    } finally {
      this.running = false;
    }
  }
  async advanceCoverage(channelId: string) {
    await this.storage.withTransaction(async tx => {
      await this.lock(tx);
      const rows = await this.storage.coverage(channelId, tx);
      const ranges = rows
        .filter(r => r.rangeJson)
        .map(r => ({
          ...(JSON.parse(r.rangeJson!) as ScanRangeDto),
          completed: r.state === AnalysisReceiptState.Completed,
        }));
      if (!ranges.length) return;
      const previous = await this.storage.checkpoint(channelId, tx);
      let end = previous
        ? BigInt(previous.lastMessageId)
        : ranges.reduce(
            (n, r) => (BigInt(r.afterMessageId) < n ? BigInt(r.afterMessageId) : n),
            BigInt(ranges[0].afterMessageId),
          );
      let changed = true;
      while (changed) {
        changed = false;
        for (const r of ranges)
          if (r.completed && BigInt(r.afterMessageId) <= end && BigInt(r.endMessageId) > end) {
            end = BigInt(r.endMessageId);
            changed = true;
          }
      }
      if (
        (!previous || end > BigInt(previous.lastMessageId)) &&
        ranges.some(r => r.completed && BigInt(r.endMessageId) <= end)
      )
        await this.storage.saveCheckpoint(channelId, String(end), new Date(this.now()), tx);
    });
  }
}
