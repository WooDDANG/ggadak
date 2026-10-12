import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, link, open, unlink, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
  getHarvestingPolicyFromEnv,
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

interface DeliveryRecord {
  payload: any;
  attempts: number;
  nextAttemptAt: number;
  stopped: boolean;
  lastError?: string;
}

export class BackendApiService {
  private backendUrl: string;

  constructor(
    backendUrl: string,
    private readonly pendingDirectory = resolve(
      process.env.ANALYSIS_DELIVERY_DIR || '.data/analysis-deliveries',
    ),
    private readonly transport: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly serviceToken = process.env.BOT_SERVICE_TOKEN,
  ) {
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  get baseUrl(): string {
    return this.backendUrl;
  }

  private async syncJobRequest(path: string, method: string, body?: unknown): Promise<any> {
    if (!this.serviceToken) throw new Error('BOT_SERVICE_TOKEN is not configured');
    const response = await this.transport(`${this.backendUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.serviceToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Sync Job API failed (${response.status})`);
    const envelope = await response.json() as { data?: unknown };
    return envelope.data;
  }

  async claimSyncJob(): Promise<any | null> {
    return this.syncJobRequest('/api/v1/internal/sync-jobs/claim', 'POST', {});
  }

  async updateSyncJob(jobId: string, update: Record<string, unknown>): Promise<void> {
    await this.syncJobRequest(`/api/v1/internal/sync-jobs/${encodeURIComponent(jobId)}`, 'PUT', update);
  }

  /** Read persisted settings afresh. Missing credentials/access or BE outages disable harvesting. */
  async isMonitoredChannel(guildId: string | null | undefined, channelId: string): Promise<boolean> {
    if (!guildId || !this.serviceToken) return false;
    try {
      const response = await this.transport(`${this.backendUrl}/api/v1/internal/monitoring?guildId=${encodeURIComponent(guildId)}`, {
        headers: { Authorization: `Bearer ${this.serviceToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return false;
      const result = await response.json() as { data?: { channelIds?: unknown } };
      return Array.isArray(result.data?.channelIds) && result.data.channelIds.includes(channelId);
    } catch { return false; }
  }

  async syncPolicy(): Promise<HarvestingPolicyConfig> {
    try {
      const res = await this.transport(`${this.backendUrl}/api/config/policy`);
      if (res.ok) {
        const policy = (await res.json()) as HarvestingPolicyConfig;
        logger.info(
          `[Policy] Synced centralized policy: ReactionThreshold=${policy.reactionThreshold}, Debounce=${policy.debounceMs}ms, MaxWindow=${policy.maxMergedWindow}`,
        );
        return policy;
      }
    } catch (err: any) {
      logger.warn(
        `[Policy] Could not fetch policy from backend: ${err.message}. Using env/defaults.`,
      );
    }
    return getHarvestingPolicyFromEnv() || DEFAULT_HARVESTING_POLICY;
  }

  async analyzeDiscussion(payload: {
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
  }): Promise<any> {
    // Persist the complete request before dispatch; retries always use this exact payload.
    const requestId =
      payload.requestId ||
      `bot-${createHash('sha256').update(deliveryIdentity(payload)).digest('hex')}`;
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
      record = {
        payload: { ...payload, requestId },
        attempts: 0,
        nextAttemptAt: 0,
        stopped: false,
      };
      const temporary = `${filename}.${randomUUID()}.tmp`;
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
    return this.deliverAnalysis(record, filename);
  }

  private parseDelivery(contents: string): DeliveryRecord {
    const parsed = JSON.parse(contents);
    // Older journal files stored a bare request. Preserve that exact payload.
    return parsed.payload && typeof parsed.attempts === 'number'
      ? parsed
      : { payload: parsed, attempts: 0, nextAttemptAt: 0, stopped: false };
  }

  private async persistDelivery(record: DeliveryRecord, filename: string): Promise<void> {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, filename);
    const directory = await open(this.pendingDirectory, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async deliverAnalysis(record: DeliveryRecord, filename: string): Promise<any> {
    if (record.stopped || record.attempts >= 3)
      throw new Error('Analysis delivery requires explicit manual retry');
    if (record.nextAttemptAt > this.now())
      throw new Error('Analysis delivery waiting for retry backoff');
    record.attempts++;
    // An interrupted attempt also consumes its persisted budget and backs off after restart.
    record.nextAttemptAt = this.now() + 60_000 * 2 ** (record.attempts - 1);
    if (record.attempts >= 3) record.stopped = true;
    await this.persistDelivery(record, filename);
    let permanent = false;
    try {
      const payload = record.payload;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (payload.traceId) headers['X-Trace-Id'] = payload.traceId;
      const response = await this.transport(`${this.backendUrl}/api/discussions/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(50_000),
      });
      if (!response.ok) {
        permanent =
          response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        throw new Error(`Backend AI returned status ${response.status}`);
      }
      const result = (await response.json()) as any;
      if (typeof result.found !== 'boolean' || !Array.isArray(result.decisions)) {
        permanent = true;
        throw new Error('Backend returned an invalid analysis result');
      }
      await unlink(filename).catch((error: any) => {
        if (error.code !== 'ENOENT') throw error;
      });
      return result;
    } catch (error: any) {
      record.stopped ||= permanent;
      record.lastError = error.message;
      await this.persistDelivery(record, filename);
      throw error;
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
        if (!record.stopped && record.attempts < 3 && record.nextAttemptAt <= this.now())
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
          result: await this.deliverAnalysis(record, filename),
        });
      } catch (error: any) {
        logger.warn(`[Analysis retry] Pending delivery retained: ${error.message}`);
      }
    }
    return completed;
  }

  /** Explicit user/worker retry resets a stopped request without changing its identity or evidence. */
  async retryAnalysisRequest(requestId: string): Promise<any> {
    const names = await readdir(this.pendingDirectory);
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const filename = join(this.pendingDirectory, name);
      const record = this.parseDelivery(await readFile(filename, 'utf8'));
      if (record.payload.requestId !== requestId) continue;
      record.attempts = 0;
      record.nextAttemptAt = 0;
      record.stopped = false;
      delete record.lastError;
      await this.persistDelivery(record, filename);
      return this.deliverAnalysis(record, filename);
    }
    throw new Error('No pending Analysis Request with this ID');
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

  async resolveConflict(payload: {
    decisionId: string;
    conflictingId: string;
    resolution: string;
  }): Promise<boolean> {
    const res = await this.transport(`${this.backendUrl}/api/decisions/resolve-conflict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async getCheckpoint(channelId: string): Promise<string | null> {
    try {
      const res = await this.transport(`${this.backendUrl}/api/channels/${channelId}/checkpoint`);
      if (res.ok) {
        const data = (await res.json()) as { lastMessageId?: string };
        return data.lastMessageId || null;
      }
    } catch (err: any) {
      logger.warn(`[Checkpoint] Failed to get checkpoint for ${channelId}: ${err.message}`);
    }
    return null;
  }

  async saveCheckpoint(channelId: string, lastMessageId: string): Promise<void> {
    const response = await this.transport(
      `${this.backendUrl}/api/channels/${channelId}/checkpoint`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastMessageId }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`Checkpoint write failed (HTTP ${response.status})`);
  }
}
