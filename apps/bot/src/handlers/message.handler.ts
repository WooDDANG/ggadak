import { Message } from 'discord.js';
import {
  HarvestingPolicyConfig,
  createLogger,
  evaluateSemanticDecision,
  CONSENSUS_REGEX,
} from '@ggaddak/shared';
import { IDecisionHarvestingEngine } from '../services/decision-harvesting-engine.types.js';

const logger = createLogger('BOT-MESSAGE-HANDLER');

export { CONSENSUS_REGEX };

export class MessageHandler {
  constructor(
    private engine: IDecisionHarvestingEngine,
    private onAddReaction: (message: Message, emoji: string) => Promise<void>,
    private isMonitored: (
      guildId: string | null,
      channelId: string,
    ) => Promise<boolean> = async () => true,
  ) {}

  async handleMessage(message: Message, policy: HarvestingPolicyConfig): Promise<void> {
    if (message.author.bot) return;
    if (!(await this.isMonitored(message.guildId, message.channelId))) return;

    const isKeywordMatch = CONSENSUS_REGEX.test(message.content);
    const semanticMatch = evaluateSemanticDecision(message.content);

    if (isKeywordMatch || semanticMatch.isCandidate) {
      const traceId = `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const channelName =
        'name' in message.channel ? (message.channel.name as string) : message.channelId;

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

      // Thin delegation to the deep engine — engine encapsulates debounce and in-flight locks
      await this.engine.harvest(
        {
          type: 'EVENT',
          message,
          isManualOverride: false,
          traceId,
        },
        policy,
      );
    }
  }
}
