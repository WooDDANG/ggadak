import { AnalysisReceiptState } from '@ggaddak/shared';
import type { SyncJobClaim, SyncWorkerUpdate } from './sync-job-worker.js';
import { analysisScheduler } from './channel-scheduler.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  link,
  open,
  unlink,
  rename,
  statfs,
  stat,
} from 'node:fs/promises';
import { JournalBudget } from './journal-budget.js';
import { resolve, join, dirname } from 'node:path';
import {
  HarvestingPolicyConfig,
  HarvestingPolicyConfigSchema,
  DEFAULT_HARVESTING_POLICY,
  createLogger,
} from '@ggaddak/shared';

const logger = createLogger('BOT-BACKEND-API');

function stablePayload(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stablePayload).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stablePayload(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function deliveryIdentity(payload: any): string {
  const { traceId: _trace, requestId: _request, ...identity } = payload;
  return stablePayload(identity);
}

export interface DeliveryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  jitter: number;
}
export class AnalysisDeliveryError extends Error {
  constructor(
    message: string,
    public readonly outcome: 'retry-pending' | 'retained-failure',
    public readonly requestId: string,
  ) {
    super(message);
  }
}
export class BackendRequestError extends Error {
  constructor(readonly statusCode: number) {
    super(`Backend request failed (${statusCode})`);
  }
}
export interface ScanRange {
  afterMessageId: string;
  startMessageId: string;
  endMessageId: string;
}
export interface SyncScanManifest {
  scannedCount: number;
  entries: Array<{
    payload: Parameters<BackendApiService['analyzeDiscussion']>[0];
    scanRange: ScanRange;
  }>;
}

export interface DeliveryRecord {
  receipt?: boolean;
  scanId?: string;
  rangeIndex?: number;
  feedbackApplied?: boolean;
  serverAcknowledged?: boolean;
  compacted?: boolean;
  enqueuedAt?: number;
  receivedAt?: number;
  feedbackAppliedAt?: number;
  feedbackNextAttemptAt?: number;
  feedbackAttempts?: number;
  failureFeedbackApplied?: boolean;
  checkpointAcknowledged?: boolean;
  fingerprint?: string;
  reactionRecovered?: boolean;
  scanRange?: ScanRange;
  payload: any;
  attempts: number;
  nextAttemptAt: number;
  stopped: boolean;
  lastError?: string;
  errorCategory?: string;
  result?: any;
  completedAt?: number;
  retryCommandIds?: string[];
}

export class BackendApiService {
  private journal: JournalBudget;
  private backendUrl: string;
  private lastPolicy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY;
  private retryCommandsInFlight = new Set<string>();
  private deliveryObserver?: (payload: any, result?: any, error?: unknown) => Promise<void>;
  private reconciling = false;
  private recoveringCheckpoints = false;
  private checkpointRevision = '';

  constructor(
    backendUrl: string,
    private readonly pendingDirectory = resolve(
      process.env.ANALYSIS_DELIVERY_DIR || '.data/analysis-deliveries',
    ),
    private readonly transport: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly serviceToken = process.env.BOT_SERVICE_TOKEN,
    private readonly deliveryOptions: DeliveryOptions = {
      maxAttempts: Number(process.env.ANALYSIS_MAX_ATTEMPTS || 5),
      initialDelayMs: Number(process.env.ANALYSIS_RETRY_DELAY_MS || 5000),
      maxDelayMs: Number(process.env.ANALYSIS_MAX_DELAY_MS || 300000),
      timeoutMs: Number(process.env.ANALYSIS_TIMEOUT_MS || 190000),
      jitter: Number(process.env.ANALYSIS_RETRY_JITTER || 0.2),
    },
    private readonly random: () => number = Math.random,
    readonly asyncDelivery = process.env.ANALYSIS_ASYNC_DELIVERY !== 'false' &&
      process.env.NODE_ENV !== 'test',
  ) {
    this.journal = new JournalBudget(pendingDirectory);
    const o = deliveryOptions;
    if (
      !Number.isInteger(o.maxAttempts) ||
      o.maxAttempts < 1 ||
      o.maxAttempts > 100 ||
      ![o.initialDelayMs, o.maxDelayMs, o.timeoutMs].every(
        n => Number.isFinite(n) && n > 0 && n <= 3600000,
      ) ||
      o.maxDelayMs < o.initialDelayMs ||
      !Number.isFinite(o.jitter) ||
      o.jitter < 0 ||
      o.jitter > 1
    )
      throw new Error('Invalid analysis delivery configuration');
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  observeDeliveries(
    observer: (payload: any, result?: any, error?: unknown) => Promise<void>,
  ): void {
    this.deliveryObserver = observer;
  }

  async reconcileDeliveryReactions(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      for (const { record } of await this.deliveryRecords()) {
        if (record.result || record.receipt || record.reactionRecovered || record.scanId) continue;
        await analysisScheduler.run(
          `${this.pendingDirectory}:${record.payload.channelId || 'unknown'}`,
          async () => {
            await this.deliveryObserver?.(record.payload);
            record.reactionRecovered = true;
            await this.persistJson(record, this.deliveryFilename(record.payload.requestId));
          },
        );
      }
    } finally {
      this.reconciling = false;
    }
  }
  private deliveryFilename(requestId: string) {
    return join(
      this.pendingDirectory,
      `${createHash('sha256').update(requestId).digest('hex')}.json`,
    );
  }
  async deliverScanSegment(payload: any, scanId: string, rangeIndex: number, range: ScanRange) {
    return this.enqueueAnalysis(payload, undefined, range, undefined, { scanId, rangeIndex });
  }
  async queueRequest(path: string, method: string, body?: unknown) {
    return this.syncJobRequest(`/api/v1/internal/analysis-queue${path}`, method, body);
  }
  transferDirectory(id: string) {
    return join(this.pendingDirectory, 'transfers', createHash('sha256').update(id).digest('hex'));
  }
  async writeTransfer(id: string, name: string, value: unknown) {
    const directory = this.transferDirectory(id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.persistJson(value, join(directory, name));
  }
  async readTransfer(id: string, name: string): Promise<any | null> {
    try {
      return JSON.parse(await readFile(join(this.transferDirectory(id), name), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async archiveConfirmed(filename: string): Promise<void> {
    const archive = join(this.pendingDirectory, 'completed');
    await mkdir(archive, { recursive: true });
    await rename(filename, join(archive, filename.split('/').at(-1)!));
    for (const directory of [archive, this.pendingDirectory]) {
      const handle = await open(directory, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  }
  async reconcileResults(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const existing = await this.deliveryRecords();
      for (const entry of existing) {
        if (entry.record.serverAcknowledged && entry.record.feedbackApplied)
          await this.archiveConfirmed(entry.filename);
      }
      const records = existing.filter(
        e =>
          e.record.receipt &&
          !e.record.serverAcknowledged &&
          (e.record.feedbackNextAttemptAt ?? 0) <= this.now(),
      );
      for (let offset = 0; offset < records.length; offset += 100) {
        const batch = records.slice(offset, offset + 100);
        const results = await this.queueRequest(
          `/results?ids=${encodeURIComponent(batch.map(e => e.record.payload.requestId).join(','))}`,
          'GET',
        );
        for (const result of results ?? []) {
          const entry = batch.find(e => e.record.payload.requestId === result.requestId);
          if (!entry) continue;
          try {
            if (result.state === AnalysisReceiptState.Failed) {
              if (!entry.record.failureFeedbackApplied && !entry.record.scanId)
                await this.deliveryObserver?.(
                  entry.record.payload,
                  undefined,
                  new Error('Analysis failure retained; retry from web'),
                );
              entry.record.failureFeedbackApplied = true;
              entry.record.errorCategory = result.errorCategory;
              entry.record.feedbackNextAttemptAt = this.now() + 30000;
              await this.persistJson(entry.record, entry.filename);
              continue;
            }
            if (result.state !== AnalysisReceiptState.Completed || !result.result) continue;
            entry.record.result = result.result;
            entry.record.completedAt = this.now();
            await this.persistJson(entry.record, entry.filename);
            if (!entry.record.feedbackApplied && !entry.record.scanId)
              await this.deliveryObserver?.(entry.record.payload, result.result);
            entry.record.feedbackApplied = true;
            entry.record.feedbackAppliedAt = this.now();
            await this.persistJson(entry.record, entry.filename);
            await this.queueRequest('/ack', 'POST', { ids: [result.requestId] });
            entry.record.serverAcknowledged = true;
            await this.persistJson(entry.record, entry.filename);
            await this.archiveConfirmed(entry.filename);
          } catch (error) {
            entry.record.feedbackAttempts = (entry.record.feedbackAttempts ?? 0) + 1;
            entry.record.feedbackNextAttemptAt =
              this.now() +
              Math.min(300000, 5000 * 2 ** Math.min(entry.record.feedbackAttempts - 1, 6));
            await this.persistJson(entry.record, entry.filename);
            logger.warn(
              `Result feedback retained for ${result.requestId}: ${error instanceof Error ? error.message : 'unavailable'}`,
            );
          }
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  get baseUrl(): string {
    return this.backendUrl;
  }
  async cleanupCompleted(
    retentionMs = Number(process.env.ANALYSIS_COMPLETED_RETENTION_MS ?? 7 * 86400000),
  ) {
    if (!Number.isFinite(retentionMs) || retentionMs < 0)
      throw new Error('Invalid completed retention');
    const archive = join(this.pendingDirectory, 'completed');
    let files: string[] = [];
    try {
      files = await readdir(archive);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let compacted = 0;
    for (const name of files.filter(n => n.endsWith('.json'))) {
      if (compacted >= 50) break;
      const filename = join(archive, name),
        record = this.parseDelivery(await readFile(filename, 'utf8'));
      if (
        record.compacted ||
        !record.serverAcknowledged ||
        !record.feedbackApplied ||
        !record.completedAt ||
        record.completedAt > this.now() - retentionMs
      )
        continue;
      record.fingerprint ??= createHash('sha256')
        .update(deliveryIdentity(record.payload))
        .digest('hex');
      record.payload = {
        requestId: record.payload.requestId,
        guildId: record.payload.guildId,
        channelId: record.payload.channelId,
      };
      delete record.result;
      record.compacted = true;
      await this.persistJson(record, filename);
      compacted++;
    }
    const transfers = join(this.pendingDirectory, 'transfers');
    let scans: string[] = [];
    try {
      scans = await readdir(transfers);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    scans.sort();
    const cursorFile = join(this.pendingDirectory, '.control', 'cleanup-cursor.json');
    await mkdir(dirname(cursorFile), { recursive: true, mode: 0o700 });
    let cursor = '';
    try {
      cursor = JSON.parse(await readFile(cursorFile, 'utf8')).scan ?? '';
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const ordered = [
      ...scans.filter(name => name > cursor),
      ...scans.filter(name => name <= cursor),
    ];
    for (const name of ordered.slice(0, 50)) {
      await this.persistJson({ scan: name }, cursorFile);
      const filename = join(transfers, name, 'manifest.json');
      let manifest: any;
      try {
        manifest = JSON.parse(await readFile(filename, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      if (
        manifest.compacted ||
        !manifest.uploaded ||
        !manifest.uploadedAt ||
        manifest.uploadedAt > this.now() - retentionMs
      )
        continue;
      const remote = await this.queueRequest(`/scans/${encodeURIComponent(manifest.id)}`, 'GET');
      if (remote?.completed !== manifest.ranges || remote?.failed) continue;
      for (let page = 0; page < manifest.pages; page++) {
        const pageFile = join(transfers, name, `page-${page}.json`);
        try {
          const bytes = (await stat(pageFile)).size;
          await unlink(pageFile);
          await this.journal.reserve(-bytes, false);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      manifest.compacted = true;
      await this.persistJson(manifest, filename);
    }
    return { compacted, ...(await this.journal.usage()) };
  }

  private async syncJobRequest(path: string, method: string, body?: unknown): Promise<any> {
    if (!this.serviceToken) throw new Error('BOT_SERVICE_TOKEN is not configured');
    const response = await this.transport(`${this.backendUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.serviceToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new BackendRequestError(response.status);
    const envelope = (await response.json()) as { data?: unknown };
    return envelope.data;
  }

  async claimSyncJob(): Promise<SyncJobClaim | null> {
    return this.syncJobRequest('/api/v1/internal/sync-jobs/claim', 'POST', {});
  }

  async updateSyncJob(jobId: string, update: SyncWorkerUpdate): Promise<void> {
    await this.syncJobRequest(
      `/api/v1/internal/sync-jobs/${encodeURIComponent(jobId)}`,
      'PUT',
      update,
    );
  }

  async loadSyncScan(scanId: string): Promise<SyncScanManifest | null> {
    const filename = join(
      this.pendingDirectory,
      'sync-scans',
      `${createHash('sha256').update(scanId).digest('hex')}.json`,
    );
    try {
      return JSON.parse(await readFile(filename, 'utf8')) as SyncScanManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /** Freeze every range before analysis can advance the Channel Checkpoint. */
  async saveSyncScan(scanId: string, manifest: SyncScanManifest): Promise<SyncScanManifest> {
    const directory = join(this.pendingDirectory, 'sync-scans');
    await mkdir(directory, { recursive: true });
    const filename = join(directory, `${createHash('sha256').update(scanId).digest('hex')}.json`);
    await this.persistJson(manifest, filename, true);
    return (await this.loadSyncScan(scanId))!;
  }

  /** Read persisted settings afresh. Missing credentials/access or BE outages disable harvesting. */
  async isMonitoredChannel(
    guildId: string | null | undefined,
    channelId: string,
  ): Promise<boolean> {
    if (!guildId || !this.serviceToken) return false;
    try {
      const response = await this.transport(
        `${this.backendUrl}/api/v1/internal/monitoring?guildId=${encodeURIComponent(guildId)}`,
        {
          headers: { Authorization: `Bearer ${this.serviceToken}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) return false;
      const result = (await response.json()) as { data?: { channelIds?: unknown } };
      return Array.isArray(result.data?.channelIds) && result.data.channelIds.includes(channelId);
    } catch {
      return false;
    }
  }

  async requireMonitoredChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await this.syncJobRequest(
      `/api/v1/internal/monitoring?guildId=${encodeURIComponent(guildId)}`,
      'GET',
    );
    if (!Array.isArray(settings?.channelIds))
      throw new Error('Channel monitoring settings are unavailable');
    return settings.channelIds.includes(channelId);
  }

  async syncPolicy(): Promise<HarvestingPolicyConfig> {
    try {
      const res = await this.transport(`${this.backendUrl}/api/config/policy`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const policy = HarvestingPolicyConfigSchema.parse(await res.json());
        logger.info(
          `[Policy] Synced centralized policy: ReactionThreshold=${policy.reactionThreshold}, Debounce=${policy.debounceMs}ms, MaxWindow=${policy.maxMergedWindow}`,
        );
        this.lastPolicy = policy;
        return policy;
      }
    } catch (err: any) {
      logger.warn(
        `[Policy] Could not fetch policy from backend: ${err.message}. Using env/defaults.`,
      );
    }
    return this.lastPolicy;
  }

  async analyzeDiscussion(
    payload: {
      requestId?: string;
      rawMessages: any[];
      guildId?: string;
      channelId?: string;
      channelName?: string;
      triggerMessageId?: string;
      messageUrl?: string;
      isManualOverride?: boolean;
      traceId?: string;
      score?: number;
      participantCount?: number;
      reactionsCount?: number;
    },
    onExecuting?: () => Promise<void>,
    scanRange?: ScanRange,
    onSettled?: (result?: any, error?: unknown) => Promise<void>,
  ): Promise<any> {
    return this.enqueueAnalysis(payload, onExecuting, scanRange, onSettled);
  }

  private async enqueueAnalysis(
    payload: any,
    onExecuting?: () => Promise<void>,
    scanRange?: ScanRange,
    onSettled?: (result?: any, error?: unknown) => Promise<void>,
    scan?: { scanId: string; rangeIndex: number },
  ): Promise<any> {
    if (
      scanRange &&
      (![scanRange.afterMessageId, scanRange.startMessageId, scanRange.endMessageId].every(id =>
        /^\d+$/.test(id),
      ) ||
        BigInt(scanRange.afterMessageId) >= BigInt(scanRange.startMessageId) ||
        BigInt(scanRange.startMessageId) > BigInt(scanRange.endMessageId))
    )
      throw new Error('Invalid Scan Range');
    // Persist the complete request before dispatch; retries always use this exact payload.
    const requestId =
      payload.requestId ||
      (payload.isManualOverride
        ? `bot-${randomUUID()}`
        : `bot-${createHash('sha256').update(deliveryIdentity(payload)).digest('hex')}`);
    const filename = join(
      this.pendingDirectory,
      `${createHash('sha256').update(requestId).digest('hex')}.json`,
    );
    await mkdir(this.pendingDirectory, { recursive: true, mode: 0o700 });
    let record: DeliveryRecord;
    try {
      record = this.parseDelivery(await readFile(filename, 'utf8'));
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      try {
        const archived = this.parseDelivery(
          await readFile(
            join(this.pendingDirectory, 'completed', filename.split('/').at(-1)!),
            'utf8',
          ),
        );
        const fingerprint = createHash('sha256').update(deliveryIdentity(payload)).digest('hex');
        if (
          (archived.fingerprint ??
            createHash('sha256').update(deliveryIdentity(archived.payload)).digest('hex')) !==
          fingerprint
        )
          throw new Error('Analysis Request ID already has a different payload');
        return { accepted: true, requestId, found: false, decisions: [] };
      } catch (archiveError) {
        if ((archiveError as NodeJS.ErrnoException).code !== 'ENOENT') throw archiveError;
      }
      record = {
        payload: { ...payload, requestId },
        scanRange,
        attempts: 0,
        nextAttemptAt: 0,
        stopped: false,
        fingerprint: createHash('sha256').update(deliveryIdentity(payload)).digest('hex'),
        enqueuedAt: this.now(),
        ...scan,
      };
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await this.journal.reserve(Buffer.byteLength(JSON.stringify(record)), true);
      const disk = await statfs(this.pendingDirectory);
      if (disk.bavail * disk.bsize < Buffer.byteLength(JSON.stringify(record)) + 64 * 1024 * 1024)
        throw new Error('Bot receive disk capacity unavailable');
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(record));
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(temporary, filename);
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        record = this.parseDelivery(await readFile(filename, 'utf8'));
      } finally {
        await unlink(temporary);
      }
      const directory = await open(this.pendingDirectory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
    if (deliveryIdentity(record.payload) !== deliveryIdentity(payload))
      throw new Error('Analysis Request ID already has a different payload');
    if (scan && record.stopped && record.errorCategory === 'receive-capacity') {
      record.stopped = false;
      record.attempts = 0;
      record.nextAttemptAt = 0;
      delete record.lastError;
      await this.persistJson(record, filename);
    }
    return analysisScheduler.run(
      `${this.pendingDirectory}:${payload.channelId || 'unknown'}`,
      async () => {
        const fresh = this.parseDelivery(await readFile(filename, 'utf8'));
        if (scanRange && !fresh.scanRange) {
          fresh.scanRange = scanRange;
          await this.persistJson(fresh, filename);
        }
        return this.runDelivery(fresh, filename, onExecuting, onSettled);
      },
    );
  }

  private parseDelivery(contents: string): DeliveryRecord {
    const parsed = JSON.parse(contents);
    // Older journal files stored a bare request. Preserve that exact payload.
    return parsed.payload && typeof parsed.attempts === 'number'
      ? parsed
      : { payload: parsed, attempts: 0, nextAttemptAt: 0, stopped: false };
  }

  private async persistJson(record: unknown, filename: string, immutable = false): Promise<void> {
    const bytes = Buffer.byteLength(JSON.stringify(record));
    let previous = 0,
      exists = false;
    try {
      previous = (await stat(filename)).size;
      exists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.journal.reserve(bytes - previous, !exists);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
    } finally {
      await file.close();
    }
    if (immutable) {
      try {
        await link(temporary, filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      } finally {
        await unlink(temporary);
      }
    } else {
      await rename(temporary, filename);
    }
    const directory = await open(dirname(filename), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async runDelivery(
    record: DeliveryRecord,
    filename: string,
    onExecuting?: () => Promise<void>,
    onSettled?: (result?: any, error?: unknown) => Promise<void>,
  ): Promise<any> {
    let result: any;
    let failure: unknown;
    try {
      result = await this.deliverAnalysis(record, filename, onExecuting);
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      try {
        if (!result?.accepted) {
          await onSettled?.(result, failure);
          await this.deliveryObserver?.(record.payload, result, failure);
        }
      } catch (error: any) {
        logger.warn(
          `Analysis completed but Discord feedback could not be updated: ${error.message}`,
        );
      }
    }
  }

  private async deliverAnalysis(
    record: DeliveryRecord,
    filename: string,
    onExecuting?: () => Promise<void>,
  ): Promise<any> {
    if (record.result) return record.result;
    if (record.receipt)
      return { accepted: true, requestId: record.payload.requestId, found: false, decisions: [] };
    if (record.stopped || record.attempts >= this.deliveryOptions.maxAttempts)
      throw new AnalysisDeliveryError(
        'Analysis delivery requires explicit manual retry',
        'retained-failure',
        record.payload.requestId,
      );
    if (record.nextAttemptAt > this.now())
      throw new AnalysisDeliveryError(
        'Analysis delivery waiting for retry backoff',
        'retry-pending',
        record.payload.requestId,
      );
    record.attempts++;
    // An interrupted attempt also consumes its persisted budget and backs off after restart.
    const o = this.deliveryOptions;
    const delay = Math.min(o.maxDelayMs, o.initialDelayMs * 2 ** (record.attempts - 1));
    record.nextAttemptAt =
      this.now() +
      Math.min(o.maxDelayMs, Math.round(delay * (1 - o.jitter + 2 * o.jitter * this.random())));
    if (record.attempts >= o.maxAttempts) record.stopped = true;
    await this.persistJson(record, filename);
    let permanent = false;
    delete record.errorCategory;
    try {
      await onExecuting?.();
      const payload = record.payload;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.serviceToken) headers.Authorization = `Bearer ${this.serviceToken}`;
      if (payload.traceId) headers['X-Trace-Id'] = payload.traceId;
      const { response, result } = await this.boundedTransport(
        `${this.backendUrl}${this.asyncDelivery ? '/api/v1/internal/analysis-queue/receipts' : '/api/discussions/analyze'}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(
            this.asyncDelivery
              ? {
                  input: payload,
                  ...(record.scanId
                    ? {
                        scanId: record.scanId,
                        rangeIndex: record.rangeIndex,
                        range: record.scanRange,
                      }
                    : {}),
                }
              : payload,
          ),
          signal: AbortSignal.timeout(this.deliveryOptions.timeoutMs),
        },
      );
      if (!response.ok) {
        // Legacy analysis API keeps working after an HTTP client times out. A live owner
        // returns this specific 503; checking it again must not exhaust delivery retries.
        if (
          response.status === 503 &&
          result?.error === 'Analysis is already in progress; retry this request'
        ) {
          record.attempts--;
          record.stopped = false;
          record.errorCategory = 'analysis-in-progress';
          throw new Error('Backend analysis is still processing; waiting for completion');
        }
        permanent =
          response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        record.errorCategory =
          response.status === 413
            ? 'receive-capacity'
            : response.status === 422
              ? 'analysis-terminal'
              : permanent
                ? 'configuration-or-payload'
                : 'backend-unavailable';
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const ms = /^\d+(\.\d+)?$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - this.now();
          if (Number.isFinite(ms) && ms > 0)
            record.nextAttemptAt = Math.max(
              record.nextAttemptAt,
              this.now() + Math.min(ms, 86400000),
            );
        }
        throw new Error(`Backend AI returned status ${response.status}`);
      }
      if (this.asyncDelivery && result?.data?.requestId === payload.requestId) {
        record.receipt = true;
        record.receivedAt = this.now();
        record.stopped = false;
        delete record.lastError;
        delete record.errorCategory;
        await this.persistJson(record, filename);
        return { accepted: true, requestId: payload.requestId, found: false, decisions: [] };
      }
      if (typeof result.found !== 'boolean' || !Array.isArray(result.decisions)) {
        permanent = true;
        record.errorCategory = 'invalid-result';
        throw new Error('Backend returned an invalid analysis result');
      }
      record.result = result;
      record.completedAt = this.now();
      record.stopped = false;
      delete record.lastError;
      delete record.errorCategory;
      await this.persistJson(record, filename);
      return result;
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        permanent = true;
        record.errorCategory = 'invalid-result';
      }
      record.stopped ||= permanent;
      record.lastError = error.message;
      await this.persistJson(record, filename);
      throw new AnalysisDeliveryError(
        error.message,
        record.stopped ? 'retained-failure' : 'retry-pending',
        record.payload.requestId,
      );
    }
  }

  async retryPendingAnalyses(limit = 20): Promise<Array<{ payload: any; result: any }>> {
    let filenames: string[];
    try {
      filenames = await readdir(this.pendingDirectory);
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const eligible: Array<{ record: DeliveryRecord; filename: string }> = [];
    for (const name of filenames.filter(name => name.endsWith('.json')).sort()) {
      try {
        const filename = join(this.pendingDirectory, name);
        const record = this.parseDelivery(await readFile(filename, 'utf8'));
        if (
          !record.result &&
          !record.receipt &&
          !record.stopped &&
          record.attempts < this.deliveryOptions.maxAttempts &&
          record.nextAttemptAt <= this.now()
        )
          eligible.push({ record, filename });
      } catch (error: any) {
        logger.warn(`[Analysis retry] Cannot read retained delivery: ${error.message}`);
      }
    }
    // Least-recently-attempted eligible work first; stopped/backoff records consume no batch slots.
    eligible.sort(
      (a, b) =>
        a.record.nextAttemptAt - b.record.nextAttemptAt || a.filename.localeCompare(b.filename),
    );
    const completed: Array<{ payload: any; result: any }> = [];
    for (const { record, filename } of eligible.slice(0, Math.max(0, limit))) {
      try {
        completed.push({
          payload: record.payload,
          result: await analysisScheduler.run(
            `${this.pendingDirectory}:${record.payload.channelId || 'unknown'}`,
            async () => {
              const fresh = this.parseDelivery(await readFile(filename, 'utf8'));
              return this.runDelivery(fresh, filename);
            },
          ),
        });
      } catch (error: any) {
        logger.warn(`[Analysis retry] Pending delivery retained: ${error.message}`);
      }
    }
    return completed;
  }

  /** Explicit user/worker retry resets a stopped request without changing its identity or evidence. */
  async retryAnalysisRequest(requestId: string, commandId?: string): Promise<any> {
    const records = await this.deliveryRecords();
    const entry = records.find(({ record }) => record.payload.requestId === requestId);
    if (!entry) throw new Error('No retained Analysis Request with this ID');
    return analysisScheduler.run(
      `${this.pendingDirectory}:${entry.record.payload.channelId || 'unknown'}`,
      async () => {
        const record = this.parseDelivery(await readFile(entry.filename, 'utf8'));
        if (record.result) return record.result;
        if (record.errorCategory === 'analysis-terminal')
          throw new AnalysisDeliveryError(
            'Analysis is terminal; request a new manual analysis',
            'retained-failure',
            requestId,
          );
        if (!commandId || !record.retryCommandIds?.includes(commandId)) {
          record.attempts = 0;
          record.nextAttemptAt = 0;
          record.stopped = false;
          delete record.lastError;
          if (commandId) record.retryCommandIds = [...(record.retryCommandIds || []), commandId];
          await this.persistJson(record, entry.filename);
        }
        return this.runDelivery(record, entry.filename);
      },
    );
  }

  private async boundedTransport(
    url: string,
    init: RequestInit,
  ): Promise<{ response: Response; result: any }> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await this.transport(url, init);
          return {
            response,
            result: response.ok
              ? await response.json()
              : response.status === 503
                ? await response.json().catch(() => undefined)
                : undefined,
          };
        })(),
        new Promise<{ response: Response; result: any }>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Analysis request timeout')),
            this.deliveryOptions.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async deliveryRecords(): Promise<Array<{ record: DeliveryRecord; filename: string }>> {
    let names: string[];
    try {
      names = await readdir(this.pendingDirectory);
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return Promise.all(
      names
        .filter(name => name.endsWith('.json'))
        .map(async name => {
          const filename = join(this.pendingDirectory, name);
          return { filename, record: this.parseDelivery(await readFile(filename, 'utf8')) };
        }),
    );
  }

  async getScanBoundary(channelId: string, checkpoint?: string | null): Promise<string | null> {
    const ranges = (await this.deliveryRecords())
      .filter(({ record }) => record.payload.channelId === channelId && record.scanRange)
      .map(({ record }) => record.scanRange!);
    if (!ranges.length) return checkpoint ?? null;
    const remote = checkpoint === undefined ? await this.getCheckpoint(channelId) : checkpoint;
    let boundary = remote
      ? BigInt(remote)
      : ranges.reduce(
          (min, range) => (BigInt(range.afterMessageId) < min ? BigInt(range.afterMessageId) : min),
          BigInt(ranges[0].afterMessageId),
        );
    let changed = true;
    while (changed) {
      changed = false;
      for (const range of ranges) {
        if (BigInt(range.afterMessageId) <= boundary && BigInt(range.endMessageId) > boundary) {
          boundary = BigInt(range.endMessageId);
          changed = true;
        }
      }
    }
    return boundary.toString();
  }

  async recoverScanCheckpoints(): Promise<void> {
    if (this.recoveringCheckpoints) return;
    this.recoveringCheckpoints = true;
    try {
      const entries = await this.deliveryRecords();
      const revision = createHash('sha256')
        .update(
          stablePayload(
            entries
              .filter(e => e.record.scanRange && !e.record.scanId)
              .map(e => [e.record.payload.requestId, e.record.scanRange, Boolean(e.record.result)]),
          ),
        )
        .digest('hex');
      if (revision === this.checkpointRevision) return;
      const channels = new Set(
        entries
          .filter(({ record }) => record.scanRange && !record.scanId)
          .map(({ record }) => record.payload.channelId as string),
      );
      for (const channelId of channels) {
        const records = entries
          .filter(({ record }) => record.payload.channelId === channelId && record.scanRange)
          .map(({ record }) => record);
        const remote = await this.getCheckpoint(channelId);
        let boundary = remote
          ? BigInt(remote)
          : records.reduce(
              (min, r) =>
                BigInt(r.scanRange!.afterMessageId) < min
                  ? BigInt(r.scanRange!.afterMessageId)
                  : min,
              BigInt(records[0].scanRange!.afterMessageId),
            );
        let changed = true;
        while (changed) {
          changed = false;
          for (const record of records) {
            const range = record.scanRange!;
            if (
              record.result &&
              BigInt(range.afterMessageId) <= boundary &&
              BigInt(range.endMessageId) > boundary
            ) {
              boundary = BigInt(range.endMessageId);
              changed = true;
            }
          }
        }
        if (
          records.some(r => r.result && BigInt(r.scanRange!.endMessageId) <= boundary) &&
          (!remote || boundary > BigInt(remote))
        )
          await this.saveCheckpoint(channelId, boundary.toString());
      }
      this.checkpointRevision = revision;
    } finally {
      this.recoveringCheckpoints = false;
    }
  }

  async synchronizeDeliveryStatus(): Promise<void> {
    const records = await this.deliveryRecords();
    const requests = records
      .filter(({ record }) => record.payload.guildId && !record.receipt)
      .map(({ record }) => ({
        requestId: record.payload.requestId,
        guildId: record.payload.guildId,
        channelId: record.payload.channelId || '',
        channelName: record.payload.channelName,
        status: record.result
          ? record.result.decisions.length
            ? 'completed-with-candidates'
            : 'completed-no-decision'
          : record.stopped
            ? 'retained-failure'
            : record.attempts
              ? 'retry-pending'
              : 'pending',
        attempts: record.attempts,
        nextAttemptAt: record.nextAttemptAt,
        errorCategory:
          record.errorCategory || (record.lastError ? 'network-or-timeout' : undefined),
        lastError: record.lastError,
        scanRange: record.scanRange,
      }));
    const control = join(this.pendingDirectory, '.control');
    await mkdir(control, { recursive: true });
    const ackFile = join(control, 'status-acks.json');
    let acks: Record<string, string> = {};
    try {
      acks = JSON.parse(await readFile(ackFile, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const changes = requests.filter(
      r => acks[r.requestId] !== createHash('sha256').update(stablePayload(r)).digest('hex'),
    );
    const commands: any[] = [];
    for (let offset = 0; offset < Math.max(1, changes.length); offset += 100) {
      const batch = changes.slice(offset, offset + 100);
      commands.push(
        ...((await this.syncJobRequest('/api/v1/internal/analysis-deliveries/sync', 'POST', {
          requests: batch,
        })) ?? []),
      );
      for (const r of batch)
        acks[r.requestId] = createHash('sha256').update(stablePayload(r)).digest('hex');
      await this.persistJson(acks, ackFile);
    }
    for (const command of commands || []) {
      if (this.retryCommandsInFlight.has(command.id)) continue;
      this.retryCommandsInFlight.add(command.id);
      void (async () => {
        try {
          try {
            await this.retryAnalysisRequest(command.requestId, command.id);
          } catch (error) {
            if (!(error instanceof AnalysisDeliveryError)) throw error;
          }
          await this.syncJobRequest(
            `/api/v1/internal/analysis-deliveries/retries/${encodeURIComponent(command.id)}/ack`,
            'POST',
            {},
          );
        } catch (error: any) {
          logger.warn(`Web analysis retry retained: ${error.message}`);
        } finally {
          this.retryCommandsInFlight.delete(command.id);
        }
      })();
    }
  }

  async saveFeedback(payload: {
    id: string;
    source: string;
    detail?: string;
    content: string;
    channelId?: string;
    createdAt: string;
  }): Promise<boolean> {
    const res = await this.transport(`${this.backendUrl}/api/feedbacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async getCheckpoint(channelId: string): Promise<string | null> {
    try {
      const res = await this.transport(`${this.backendUrl}/api/channels/${channelId}/checkpoint`, {
        headers: this.serviceToken ? { Authorization: `Bearer ${this.serviceToken}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = (await res.json()) as { lastMessageId?: string };
        return data.lastMessageId || null;
      }
      throw new Error(`Checkpoint read failed (HTTP ${res.status})`);
    } catch (err: any) {
      logger.warn(`[Checkpoint] Failed to get checkpoint for ${channelId}: ${err.message}`);
      throw err;
    }
  }

  async saveCheckpoint(channelId: string, lastMessageId: string): Promise<void> {
    const response = await this.transport(
      `${this.backendUrl}/api/channels/${channelId}/checkpoint`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.serviceToken ? { Authorization: `Bearer ${this.serviceToken}` } : {}),
        },
        body: JSON.stringify({ lastMessageId }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Checkpoint write failed (HTTP ${response.status})`);
  }
}
