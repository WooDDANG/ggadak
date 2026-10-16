import { BotPolicy } from '../config.js';
import { ChannelScheduler } from './channel-scheduler.js';
import { AnalysisDeliveryError } from './backend-api.service.js';
import { Message, TextChannel, Guild } from 'discord.js';
import { HarvestingPolicyConfig, DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';
import {
  IDecisionHarvestingEngine,
  HarvestTrigger,
  HarvestResult,
  DecisionSink,
} from './decision-harvesting-engine.types.js';
import { DiscussionHarvester } from './harvester.service.js';

const standaloneScheduler = new ChannelScheduler();

export class DecisionHarvestingEngine implements IDecisionHarvestingEngine {
  private pending = new Map<
    string,
    {
      timer: NodeJS.Timeout;
      firstAt: number;
      message: Message;
      resolve: (result: HarvestResult) => void;
      traceId: string;
      triggers: Message[];
    }
  >();

  constructor(
    private sink: DecisionSink,
    private harvester?: DiscussionHarvester,
  ) {}

  async harvest(
    trigger: HarvestTrigger,
    policy: HarvestingPolicyConfig = DEFAULT_HARVESTING_POLICY,
  ): Promise<HarvestResult> {
    const traceId =
      trigger.traceId || `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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

  async cancelPending(channelId?: string): Promise<void> {
    for (const [id, entry] of this.pending) {
      if (channelId && id !== channelId) continue;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve({
        success: false,
        outcome: 'canceled',
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        traceId: entry.traceId,
      });
      await this.harvester?.removeReactionSafely(entry.message, '👀');
    }
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

    const existing = this.pending.get(channelId);
    const triggers = [
      ...new Map([...(existing?.triggers || []), message].map(m => [m.id, m])).values(),
    ];
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(channelId);
      void this.harvester?.removeReactionSafely(existing.message, '👀');
      existing.resolve({
        success: false,
        outcome: 'merged',
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        traceId: existing.traceId,
        summary: 'merged into later trigger',
      });
    }
    if (isManualOverride)
      return this.executeHarvestAnalysis(message, true, policy, traceId, triggers);
    const firstAt = existing?.firstAt ?? Date.now();
    return new Promise(resolve => {
      const timer = setTimeout(
        () => {
          this.pending.delete(channelId);
          void this.executeHarvestAnalysis(message, false, policy, traceId, triggers).then(
            resolve,
            async error => {
              await this.harvester?.removeReactionSafely(message, '👀');
              resolve({
                success: false,
                outcome: 'retained-failure',
                decisions: [],
                decisionsCount: 0,
                messageCount: 0,
                traceId,
                summary: error.message,
              });
            },
          );
        },
        Math.max(0, Math.min(policy.debounceMs, BotPolicy.maxDebounceMs - (Date.now() - firstAt))),
      );
      this.pending.set(channelId, { timer, firstAt, message, resolve, traceId, triggers });
    });
  }

  private async executeHarvestAnalysis(
    message: Message,
    isManualOverride: boolean,
    policy: HarvestingPolicyConfig,
    traceId: string,
    triggers: Message[] = [message],
  ): Promise<HarvestResult> {
    const channelId = message.channelId;

    try {
      if (!this.harvester)
        return await standaloneScheduler.run(channelId, () =>
          this.executeStandalone(message, traceId),
        );
      if (this.harvester) {
        const decisions = await this.harvester.processAnalysis(
          message,
          policy,
          isManualOverride,
          traceId,
          triggers,
        );
        if (decisions && 'accepted' in decisions)
          return {
            success: true,
            outcome: 'accepted',
            pendingAnalysis: true,
            decisions: [],
            decisionsCount: 0,
            messageCount: 0,
            summary: '데이터 전달 완료 · BE 분석 대기',
            traceId,
          };
        if (!decisions || decisions.length === 0) {
          return {
            success: true,
            outcome: 'completed-no-decision',
            decisions: [],
            decisionsCount: 0,
            messageCount: 0,
            summary: 'no decision found',
            traceId,
          };
        }
        return {
          success: true,
          outcome: 'completed-with-candidates',
          decisions,
          decisionsCount: decisions.length,
          messageCount: decisions.length,
          summary: `${decisions.length} decision(s) extracted`,
          traceId,
        };
      }

      return this.executeStandalone(message, traceId);
    } catch (error: any) {
      return {
        success: false,
        outcome: error instanceof AnalysisDeliveryError ? error.outcome : 'retained-failure',
        decisions: [],
        decisionsCount: 0,
        messageCount: 0,
        traceId,
        summary: error.message,
      };
    }
  }

  private async executeStandalone(message: Message, traceId: string): Promise<HarvestResult> {
    const res = await this.sink.analyzeDiscussion({
      rawMessages: [{ id: message.id, content: message.content }],
      channelId: message.channelId,
      traceId,
    });
    const decisions = res.decisions || [];
    return {
      success: true,
      outcome: decisions.length ? 'completed-with-candidates' : 'completed-no-decision',
      decisions,
      decisionsCount: decisions.length,
      messageCount: 1,
      traceId,
      summary: res.summary,
    };
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
        pendingAnalysis: res.pendingAnalysis,
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
        pendingAnalysis: res.pendingAnalysis,
        traceId,
      };
    }
  }
}
