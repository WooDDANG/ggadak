import { Client } from 'discordx';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { MessageHandler } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { handleReadyEvent } from './ready.event.js';
import { handleGuildCreateEvent } from './guildCreate.event.js';
import { handleMessageCreateEvent } from './messageCreate.event.js';
import { handleMessageReactionAddEvent } from './messageReactionAdd.event.js';
import { handleInteractionCreateEvent } from './interactionCreate.event.js';

const logger = createLogger('EVENT-LOADER');

export function registerEvents({
  client,
  messageHandler,
  reactionHandler,
  getPolicy,
}: {
  client: Client;
  messageHandler: MessageHandler;
  reactionHandler: ReactionHandler;
  getPolicy: () => HarvestingPolicyConfig;
}) {
  handleReadyEvent(client);
  handleGuildCreateEvent(client);
  handleMessageCreateEvent(client, messageHandler, getPolicy);
  handleMessageReactionAddEvent(client, reactionHandler, getPolicy);
  handleInteractionCreateEvent(client);

  logger.info('✌️ Auto-loaded all discordx event listeners and command routers');
}
