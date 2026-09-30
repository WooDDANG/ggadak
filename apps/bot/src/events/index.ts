import { Client } from 'discord.js';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { registerCommands } from '../commands/index.js';
import { BackendApiService } from '../services/backend-api.service.js';
import { MessageHandler } from '../handlers/message.handler.js';
import { ReactionHandler } from '../handlers/reaction.handler.js';
import { InteractionHandler } from '../handlers/interaction.handler.js';
import { handleReadyEvent } from './ready.event.js';
import { handleMessageCreateEvent } from './messageCreate.event.js';
import { handleMessageReactionAddEvent } from './messageReactionAdd.event.js';
import { handleInteractionCreateEvent } from './interactionCreate.event.js';

const logger = createLogger('EVENT-LOADER');

export function registerEvents({
  client,
  token,
  apiService,
  messageHandler,
  reactionHandler,
  interactionHandler,
  getPolicy,
  onScanChannels,
}: {
  client: Client;
  token?: string;
  apiService: BackendApiService;
  messageHandler: MessageHandler;
  reactionHandler: ReactionHandler;
  interactionHandler: InteractionHandler;
  getPolicy: () => HarvestingPolicyConfig;
  onScanChannels: (limit: number) => Promise<void>;
}) {
  const commands = registerCommands();

  handleReadyEvent(client, token);
  handleMessageCreateEvent(client, messageHandler, getPolicy);
  handleMessageReactionAddEvent(client, reactionHandler, getPolicy);
  handleInteractionCreateEvent({
    client,
    commands,
    apiService,
    interactionHandler,
    getPolicy,
    onScanChannels,
  });

  logger.info('✌️ Auto-loaded all Discord bot event listeners and commands');
}
