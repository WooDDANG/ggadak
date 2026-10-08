import { Message, TextChannel, Guild } from 'discord.js';
import { Decision, HarvestingPolicyConfig, DEFAULT_HARVESTING_POLICY, createLogger } from '@ggaddak/shared';
import {
  IDecisionHarvestingEngine,
  HarvestTrigger,
  HarvestResult,
  DecisionSink,
} from './decision-harvesting-engine.types.js';
import { DiscussionHarvester } from './harvester.service.js';

const logger = createLogger('DECISION-HARVESTING-ENGINE');

export class DecisionHarvestingEngine implements IDecisionHarvestingEngine {
  private static instance: DecisionHarvestingEngine | null = null;
  private inFlightChannels = new Set<string>();

  constructor(
    private sink: DecisionSink,
    private harvester?: DiscussionHarvester,
  ) {
    DecisionHarvestingEngine.instance = this;
  }

  public static getInstance(): DecisionHarvestingEngine | null {
    return DecisionHarvestingEngine.instance;
  }

  async harvest(
    trigger: HarvestTrigger,
    policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY,
  ): Promise<HarvestResult> {
    const traceId =
      trigger.traceId ||
      `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (trigger.type === 'EVENT') {
      const channelId = trigger.message.channelId;
      const isManual = !!trigger.isManualOverride;

      // 1. Channel In-Flight Lock Protection
      if (this.inFlightChannels.has(channelId) && !isManual) {
        logger.info(`Channel #${channelId} is in-flight. Skipping duplicate trigger.`, {
          stage: 'LOCK',
          traceId,
        });
        return { success: false, decisions: [], messageCount: 0, summary: 'in-flight locked', traceId };
      }

      this.inFlightChannels.add(channelId);
      try {
        if (this.harvester) {
          const decisions = await this.harvester.processAnalysis(trigger.message, policy, isManual, traceId);
          if (!decisions || decisions.length === 0) {
            return { success: false, decisions: [], messageCount: 0, summary: 'no decision found', traceId };
          }
          return {
            success: true,
            decisions,
            messageCount: decisions.length,
            summary: `${decisions.length} decision(s) extracted`,
            traceId,
          };
        }

        // Standalone fake/sink execution for pure tests
        const res = await this.sink.analyzeDiscussion({
          rawMessages: [{ id: trigger.message.id, content: trigger.message.content }],
          channelId,
          traceId,
        });
        return {
          success: res.found || false,
          decisions: res.decisions || [],
          messageCount: 1,
          summary: res.summary,
          traceId,
        };
      } finally {
        this.inFlightChannels.delete(channelId);
      }
    }

    if (trigger.type === 'SCAN_CHANNEL') {
      if (this.harvester) {
        const res = await this.harvester.scanChannel(trigger.channel, policy, trigger.options);
        return {
          success: true,
          decisions: [],
          messageCount: res.scannedCount,
          channelCount: 1,
          traceId,
        };
      }
      return { success: true, decisions: [], messageCount: 0, traceId };
    }

    if (trigger.type === 'SCAN_GUILD') {
      if (this.harvester) {
        const res = await this.harvester.scanGuild(trigger.guild, policy, trigger.options);
        return {
          success: true,
          decisions: [],
          messageCount: res.scannedCount,
          channelCount: res.channelCount,
          traceId,
        };
      }
      return { success: true, decisions: [], messageCount: 0, traceId };
    }

    return { success: false, decisions: [], messageCount: 0, traceId };
  }
}
