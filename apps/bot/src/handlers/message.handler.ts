import { Message } from 'discord.js';
import { HarvestingPolicyConfig, createLogger, evaluateSemanticDecision, CONSENSUS_REGEX } from '@ggaddak/shared';

const logger = createLogger('BOT-MESSAGE-HANDLER');

export { CONSENSUS_REGEX };

export class MessageHandler {
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private firstTriggerTimes = new Map<string, number>();
  private readonly maxDebounceMs = 60000; // 최대 60초 슬라이딩 상한

  constructor(
    private onExecuteAnalysis: (message: Message, isManualOverride: boolean, traceId?: string) => Promise<any>,
    private onAddReaction: (message: Message, emoji: string) => Promise<void>,
  ) {}

  async handleMessage(message: Message, policy: HarvestingPolicyConfig): Promise<void> {
    if (message.author.bot) return;

    const isKeywordMatch = CONSENSUS_REGEX.test(message.content);
    const semanticMatch = evaluateSemanticDecision(message.content);

    if (isKeywordMatch || semanticMatch.isCandidate) {
      const traceId = `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const channelName = 'name' in message.channel ? (message.channel.name as string) : message.channelId;

      logger.info(
        `Decision candidate trigger matched in #${channelName}: "${message.content.slice(0, 30)}..."`,
        {
          stage: 'HARVEST',
          traceId,
          keyword: isKeywordMatch,
          semanticSimilarity: semanticMatch.similarity,
          author: message.author.username,
        },
      );
      await this.onAddReaction(message, '👀');
      this.enqueueChannelTrigger(message, false, policy, traceId);
    }
  }

  enqueueChannelTrigger(
    message: Message,
    isManualOverride: boolean,
    policy: HarvestingPolicyConfig,
    traceId?: string,
  ): void {
    const channelId = message.channelId;
    const currentTraceId = traceId || `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (isManualOverride) {
      const existing = this.debounceTimers.get(channelId);
      if (existing) {
        clearTimeout(existing);
        this.debounceTimers.delete(channelId);
      }
      this.firstTriggerTimes.delete(channelId);
      this.onExecuteAnalysis(message, true, currentTraceId);
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
      logger.info(
        `Max debounce limit reached (60s) for #${channelId}. Executing immediately.`,
        { stage: 'DEBOUNCE', traceId: currentTraceId },
      );
      this.onExecuteAnalysis(message, false, currentTraceId);
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
      await this.onExecuteAnalysis(message, false, currentTraceId);
    }, policy.debounceMs);

    this.debounceTimers.set(channelId, timer);
    logger.info(
      `Scheduled analysis for #${channelId} in ${policy.debounceMs / 1000}s`,
      { stage: 'DEBOUNCE', traceId: currentTraceId, debounceMs: policy.debounceMs },
    );
  }
}
