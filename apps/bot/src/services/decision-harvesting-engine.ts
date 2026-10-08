import { Message, TextChannel, Guild } from 'discord.js';
import {
  Decision,
  HarvestingPolicyConfig,
  DEFAULT_HARVESTING_POLICY,
  createLogger,
  evaluateSemanticDecision,
  CONSENSUS_REGEX,
} from '@ggaddak/shared';
import {
  IDecisionHarvestingEngine,
  HarvestTrigger,
  HarvestResult,
  DecisionSink,
} from './decision-harvesting-engine.types.js';
import { DiscussionHarvester } from './harvester.service.js';

const logger = createLogger('DECISION-HARVESTING-ENGINE');

export class DecisionHarvestingEngine implements IDecisionHarvestingEngine {
  private inFlightChannels = new Set<string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private firstTriggerTimes = new Map<string, number>();
  private readonly maxDebounceMs = 60000;

  constructor(
    private sink: DecisionSink,
    private harvester?: DiscussionHarvester,
  ) {}

  async harvest(
    trigger: HarvestTrigger,
    policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY,
  ): Promise<HarvestResult> {
    const traceId =
      trigger.traceId ||
      `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (trigger.type === 'EVENT') {
      return this.handleEventTrigger(trigger.message, !!trigger.isManualOverride, policy, traceId);
    }

    if (trigger.type === 'SCAN') {
      return this.handleScanTrigger(trigger.target, trigger.options, policy, traceId);
    }

    return {
      success: false,
      decisions: [],
      decisionsCount: 0,
      messageCount: 0,
      traceId,
    };
  }

  /**
   * Internal Event Harvest Pipeline with In-Flight Lock & Debounce
   */
  private async handleEventTrigger(
    message: Message,
    isManualOverride: boolean,
    policy: HarvestingPolicyConfig,
    traceId: string,
  ): Promise<HarvestResult> {
    const channelId = message.channelId;

    // Check in-flight lock before scheduling debounce
    if (this.inFlightChannels.has(channelId) && !isManualOverride) {
      logger.info(`Channel #${channelId} is in-flight. Skipping duplicate trigger.`, {
        stage: 'LOCK',
        traceId,
      });
      return {
        success: false,
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        summary: 'in-flight locked',
        traceId,
      };
    }

    // 1. Manual override executes immediately, clearing pending debounce
    if (isManualOverride) {
      this.clearDebounce(channelId);
      return this.executeHarvestAnalysis(message, true, policy, traceId);
    }

    // 2. Sliding window debounce scheduling
    const now = Date.now();
    const firstTrigger = this.firstTriggerTimes.get(channelId);

    if (firstTrigger && now - firstTrigger >= this.maxDebounceMs) {
      this.clearDebounce(channelId);
      logger.info(`Max debounce limit reached (60s) for #${channelId}. Executing immediately.`, {
        stage: 'DEBOUNCE',
        traceId,
      });
      return this.executeHarvestAnalysis(message, false, policy, traceId);
    }

    if (!firstTrigger) {
      this.firstTriggerTimes.set(channelId, now);
    }

    if (this.debounceTimers.has(channelId)) {
      clearTimeout(this.debounceTimers.get(channelId)!);
    }

    return new Promise<HarvestResult>((resolve) => {
      const timer = setTimeout(async () => {
        this.clearDebounce(channelId);
        const res = await this.executeHarvestAnalysis(message, false, policy, traceId);
        resolve(res);
      }, policy.debounceMs);

      this.debounceTimers.set(channelId, timer);
      logger.info(`Scheduled analysis for #${channelId} in ${policy.debounceMs / 1000}s`, {
        stage: 'DEBOUNCE',
        traceId,
        debounceMs: policy.debounceMs,
      });
    });
  }

  private clearDebounce(channelId: string): void {
    const existing = this.debounceTimers.get(channelId);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(channelId);
    }
    this.firstTriggerTimes.delete(channelId);
  }

  private async executeHarvestAnalysis(
    message: Message,
    isManualOverride: boolean,
    policy: HarvestingPolicyConfig,
    traceId: string,
  ): Promise<HarvestResult> {
    const channelId = message.channelId;

    if (this.inFlightChannels.has(channelId) && !isManualOverride) {
      logger.info(`Channel #${channelId} is in-flight. Skipping duplicate trigger.`, {
        stage: 'LOCK',
        traceId,
      });
      return {
        success: false,
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        summary: 'in-flight locked',
        traceId,
      };
    }

    this.inFlightChannels.add(channelId);
    try {
      if (this.harvester) {
        const decisions = await this.harvester.processAnalysis(message, policy, isManualOverride, traceId);
        if (!decisions || decisions.length === 0) {
          return {
            success: false,
            decisions: [],
            decisionsCount: 0,
            messageCount: 0,
            summary: 'no decision found',
            traceId,
          };
        }
        return {
          success: true,
          decisions,
          decisionsCount: decisions.length,
          messageCount: decisions.length,
          summary: `${decisions.length} decision(s) extracted`,
          traceId,
        };
      }

      // Standalone sink for pure isolated tests
      const res = await this.sink.analyzeDiscussion({
        rawMessages: [{ id: message.id, content: message.content }],
        channelId,
        traceId,
      });
      const decisions = res.decisions || [];
      return {
        success: res.found || false,
        decisions,
        decisionsCount: decisions.length,
        messageCount: 1,
        summary: res.summary,
        traceId,
      };
    } finally {
      this.inFlightChannels.delete(channelId);
    }
  }

  /**
   * Internal Scan Pipeline for Channel or Guild
   */
  private async handleScanTrigger(
    target: TextChannel | Guild,
    options: any = {},
    policy: HarvestingPolicyConfig,
    traceId: string,
  ): Promise<HarvestResult> {
    if (!this.harvester) {
      return {
        success: true,
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        traceId,
      };
    }

    const isGuild = 'channels' in target;
    if (isGuild) {
      const res = await this.harvester.scanGuild(target as Guild, policy, options);
      return {
        success: true,
        decisions: [],
        decisionsCount: res.decisionsCount,
        messageCount: res.scannedCount,
        channelCount: res.channelCount,
        traceId,
      };
    } else {
      const res = await this.harvester.scanChannel(target as TextChannel, policy, options);
      return {
        success: true,
        decisions: [],
        decisionsCount: res.decisionsCount,
        messageCount: res.scannedCount,
        channelCount: 1,
        traceId,
      };
    }
  }
}
