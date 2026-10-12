import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, link, open, unlink } from 'node:fs/promises';
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

export class BackendApiService {
  private backendUrl: string;

  constructor(
    backendUrl: string,
    private readonly pendingDirectory = resolve(
      process.env.ANALYSIS_DELIVERY_DIR || '.data/analysis-deliveries',
    ),
    private readonly transport: typeof fetch = fetch,
  ) {
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  get baseUrl(): string {
    return this.backendUrl;
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
    let delivery: typeof payload & { requestId: string };
    try {
      delivery = JSON.parse(await readFile(filename, 'utf8'));
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
      delivery = { ...payload, requestId };
      const temporary = `${filename}.${randomUUID()}.tmp`;
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(delivery));
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(temporary, filename);
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        delivery = JSON.parse(await readFile(filename, 'utf8'));
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
    if (deliveryIdentity(delivery) !== deliveryIdentity(payload))
      throw new Error('Analysis Request ID already has a different payload');
    return this.deliverAnalysis(delivery, filename);
  }

  private async deliverAnalysis(payload: any, filename: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (payload.traceId) headers['X-Trace-Id'] = payload.traceId;
    const response = await this.transport(`${this.backendUrl}/api/discussions/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    });
    if (!response.ok) throw new Error(`Backend AI returned status ${response.status}`);
    const result = (await response.json()) as any;
    if (typeof result.found !== 'boolean' || !Array.isArray(result.decisions)) {
      throw new Error('Backend returned an invalid analysis result');
    }
    await unlink(filename).catch((error: any) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return result;
  }

  async retryPendingAnalyses(limit = 20): Promise<Array<{ payload: any; result: any }>> {
    let filenames: string[];
    try {
      filenames = await readdir(this.pendingDirectory);
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const completed: Array<{ payload: any; result: any }> = [];
    for (const name of filenames
      .filter(name => name.endsWith('.json'))
      .sort()
      .slice(0, limit)) {
      try {
        const filename = join(this.pendingDirectory, name);
        const payload = JSON.parse(await readFile(filename, 'utf8'));
        completed.push({ payload, result: await this.deliverAnalysis(payload, filename) });
      } catch (error: any) {
        logger.warn(`[Analysis retry] Pending delivery retained: ${error.message}`);
      }
    }
    return completed;
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
