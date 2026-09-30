import { Client } from 'discordx';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { MessageHandler } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { AnalysisService } from '../services/analysis.service.js';
import { handleReadyEvent } from './ready.event.js';
import { handleGuildCreateEvent } from './guildCreate.event.js';
import { handleMessageCreateEvent } from './messageCreate.event.js';
import { handleMessageReactionAddEvent } from './messageReactionAdd.event.js';
import { handleInteractionCreateEvent } from './interactionCreate.event.js';

const logger = createLogger('EVENT-LOADER');

export function registerEvents({
  client,
  token,
  analysisService,
  messageHandler,
  reactionHandler,
  getPolicy,
}: {
  client: Client;
  token?: string;
  analysisService: AnalysisService;
  messageHandler: MessageHandler;
  reactionHandler: ReactionHandler;
  getPolicy: () => HarvestingPolicyConfig;
}) {
  handleReadyEvent(client, analysisService, getPolicy, token);
  handleGuildCreateEvent(client, analysisService, getPolicy);
  handleMessageCreateEvent(client, messageHandler, getPolicy);
  handleMessageReactionAddEvent(client, reactionHandler, getPolicy);
  handleInteractionCreateEvent(client);

  logger.info('✌️ Auto-loaded all discordx event listeners and command routers');
}

