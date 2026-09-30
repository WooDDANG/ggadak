import { Client, Events, Message } from 'discord.js';
import { HarvestingPolicyConfig } from '@ggaddak/shared';
import { MessageHandler } from '../handlers/message.handler.js';

export function handleMessageCreateEvent(
  client: Client,
  messageHandler: MessageHandler,
  getPolicy: () => HarvestingPolicyConfig,
) {
  client.on(Events.MessageCreate, async (message: Message) => {
    await messageHandler.handleMessage(message, getPolicy());
  });
}
