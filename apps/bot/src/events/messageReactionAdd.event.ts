import { Client, Events, MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import { HarvestingPolicyConfig } from '@ggaddak/shared';
import { ReactionHandler } from '../handlers/reaction.handler.js';

export function handleMessageReactionAddEvent(
  client: Client,
  reactionHandler: ReactionHandler,
  getPolicy: () => HarvestingPolicyConfig,
) {
  client.on(Events.MessageReactionAdd, async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
    await reactionHandler.handleReactionAdd(reaction, user, getPolicy());
  });
}
