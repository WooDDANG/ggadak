import { Message } from 'discord.js';
import { HarvestingPolicyConfig, createLogger, evaluateSemanticDecision, CONSENSUS_REGEX } from '@ggaddak/shared';

const logger = createLogger('BOT-MESSAGE-HANDLER');

export { CONSENSUS_REGEX };

export class MessageHandler {
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private firstTriggerTimes = new Map<string, number>();
  private readonly maxDebounceMs = 60000; // 최대 60초 슬라이딩 상한

  constructor(
    private onExecuteAnalysis: (message: Message, isManualOverride: boolean) => Promise<any>,
    private onAddReaction: (message: Message, emoji: string) => Promise<void>,
  ) {}

  async handleMessage(message: Message, policy: HarvestingPolicyConfig): Promise<void> {
    if (message.author.bot) return;

    const isKeywordMatch = CONSENSUS_REGEX.test(message.content);
    const semanticMatch = evaluateSemanticDecision(message.content);

    if (isKeywordMatch || semanticMatch.isCandidate) {
      logger.info(
        `[Trigger] Decision candidate matched (keyword=${isKeywordMatch}, semantic=${semanticMatch.similarity}) in #${'name' in message.channel ? message.channel.name : message.channelId}: "${message.content.slice(0, 30)}..."`,
      );
      await this.onAddReaction(message, '👀');
      this.enqueueChannelTrigger(message, false, policy);
    }
  }

  enqueueChannelTrigger(
    message: Message,
    isManualOverride: boolean,
    policy: HarvestingPolicyConfig,
  ): void {
    const channelId = message.channelId;

    if (isManualOverride) {
      const existing = this.debounceTimers.get(channelId);
      if (existing) {
        clearTimeout(existing);
        this.debounceTimers.delete(channelId);
      }
      this.firstTriggerTimes.delete(channelId);
      this.onExecuteAnalysis(message, true);
      return;
    }

    const now = Date.now();
    const firstTrigger = this.firstTriggerTimes.get(channelId);

    // If max debounce time (60s) reached, execute immediately without further delay
    if (firstTrigger && now - firstTrigger >= this.maxDebounceMs) {
      const existing = this.debounceTimers.get(channelId);
      if (existing) {
        clearTimeout(existing);
        this.debounceTimers.delete(channelId);
      }
      this.firstTriggerTimes.delete(channelId);
      logger.info(`[Debounce] Max debounce limit reached (60s) for #${channelId}. Executing immediately.`);
      this.onExecuteAnalysis(message, false);
      return;
    }

    if (!firstTrigger) {
      this.firstTriggerTimes.set(channelId, now);
    }

    if (this.debounceTimers.has(channelId)) {
      clearTimeout(this.debounceTimers.get(channelId)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(channelId);
      this.firstTriggerTimes.delete(channelId);
      await this.onExecuteAnalysis(message, false);
    }, policy.debounceMs);

    this.debounceTimers.set(channelId, timer);
    logger.info(`[Debounce] Scheduled analysis for #${channelId} in ${policy.debounceMs / 1000}s`);
  }
}
