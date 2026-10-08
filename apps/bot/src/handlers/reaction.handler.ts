import { Message, MessageReaction, PartialMessageReaction, PartialUser, User } from 'discord.js';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { IDecisionHarvestingEngine } from '../services/decision-harvesting-engine.types.js';

const logger = createLogger('BOT-REACTION-HANDLER');

export class ReactionHandler {
  constructor(
    private triggerEmoji: string,
    private engine: IDecisionHarvestingEngine,
    private onAddReaction: (message: Message, emoji: string) => Promise<void>,
  ) {}

  async handleReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    policy: HarvestingPolicyConfig,
  ): Promise<void> {
    if (user.bot) return;

    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const message = reaction.message as Message;
      const isManualOverride = reaction.emoji.name === this.triggerEmoji;

      if (isManualOverride) {
        logger.info(
          `[Override] Manual trigger '${this.triggerEmoji}' added by @${user.username} on msg ${message.id}`,
        );
        await this.onAddReaction(message, '👀');
        await this.engine.harvest({
          type: 'EVENT',
          message,
          isManualOverride: true,
        }, policy);
        return;
      }

      // Count total reactions across all emojis on this message
      const totalReactions = message.reactions.cache.reduce((sum, r) => sum + r.count, 0);
      if (totalReactions >= policy.reactionThreshold) {
        logger.info(
          `[Trigger] Reaction threshold (${totalReactions} >= ${policy.reactionThreshold}) reached on msg ${message.id}`,
        );
        await this.onAddReaction(message, '👀');
        await this.engine.harvest({
          type: 'EVENT',
          message,
          isManualOverride: false,
        }, policy);
      }
    } catch (err: any) {
      logger.error(`[Reaction] Error handling reaction add: ${err.message}`, {
        stack: err.stack,
      });
    }
  }
}
