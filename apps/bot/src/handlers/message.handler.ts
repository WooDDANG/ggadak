import { Message } from 'discord.js';
import { HarvestingPolicyConfig, createLogger, evaluateSemanticDecision } from '@ggaddak/shared';

const logger = createLogger('BOT-MESSAGE-HANDLER');

export const CONSENSUS_REGEX =
  /(~?합시다|~?합세|~?하자|~?하죠|~?해요|~?결정|~?확정|~?합의|~?채택|~?가시죠|~?가자|~?가요|~?진행할게요|~?완료|픽스|fix|agree|ok|ㅇㅋ|좋아요|찬성)/i;

export class MessageHandler {
  private debounceTimers = new Map<string, NodeJS.Timeout>();

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
      this.onExecuteAnalysis(message, true);
      return;
    }

    if (this.debounceTimers.has(channelId)) {
      clearTimeout(this.debounceTimers.get(channelId)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(channelId);
      await this.onExecuteAnalysis(message, false);
    }, policy.debounceMs);

    this.debounceTimers.set(channelId, timer);
    logger.info(`[Debounce] Scheduled analysis for #${channelId} in ${policy.debounceMs / 1000}s`);
  }
}
