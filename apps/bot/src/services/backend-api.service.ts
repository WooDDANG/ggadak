import {
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
  getHarvestingPolicyFromEnv,
  createLogger,
} from '@ggaddak/shared';

const logger = createLogger('BOT-BACKEND-API');

export class BackendApiService {
  private backendUrl: string;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  get baseUrl(): string {
    return this.backendUrl;
  }

  async syncPolicy(): Promise<HarvestingPolicyConfig> {
    try {
      const res = await fetch(`${this.backendUrl}/api/config/policy`);
      if (res.ok) {
        const policy = (await res.json()) as HarvestingPolicyConfig;
        logger.info(
          `[Policy] Synced centralized policy: ReactionThreshold=${policy.reactionThreshold}, Debounce=${policy.debounceMs}ms, MaxWindow=${policy.maxMergedWindow}`,
        );
        return policy;
      }
    } catch (err: any) {
      logger.warn(`[Policy] Could not fetch policy from backend: ${err.message}. Using env/defaults.`);
    }
    return getHarvestingPolicyFromEnv() || DEFAULT_HARVESTING_POLICY;
  }

  async analyzeDiscussion(payload: {
    rawMessages: any[];
    guildId?: string;
    channelId?: string;
    channelName?: string;
    triggerMessageId?: string;
    messageUrl?: string;
    isManualOverride?: boolean;
  }): Promise<any> {
    const res = await fetch(`${this.backendUrl}/api/discussions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Backend AI returned status ${res.status}: ${errText}`);
    }

    return await res.json();
  }

  async saveFeedback(payload: {
    id: string;
    source: string;
    detail?: string;
    content: string;
    channelId?: string;
    createdAt: string;
  }): Promise<boolean> {
    const res = await fetch(`${this.backendUrl}/api/feedbacks`, {
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
    const res = await fetch(`${this.backendUrl}/api/decisions/resolve-conflict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async getCheckpoint(channelId: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.backendUrl}/api/channels/${channelId}/checkpoint`);
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
    try {
      await fetch(`${this.backendUrl}/api/channels/${channelId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastMessageId }),
      });
    } catch (err: any) {
      logger.warn(`[Checkpoint] Failed to save checkpoint for ${channelId}: ${err.message}`);
    }
  }
}
