import { Client, Events, REST, Routes } from 'discord.js';
import { createLogger } from '@ggaddak/shared';
import { commandDefinitions } from '../commands/index.js';

const logger = createLogger('READY-EVENT');

export function handleReadyEvent(client: Client, token?: string) {
  client.once(Events.ClientReady, async readyClient => {
    logger.info(`🤖 Logged in as ${readyClient.user.tag}`);

    if (token) {
      try {
        const rest = new REST({ version: '10' }).setToken(token);
        logger.info('Registering slash commands with Discord REST API...');
        await rest.put(Routes.applicationCommands(readyClient.user.id), {
          body: commandDefinitions,
        });
        logger.info('✌️ Successfully registered slash commands (/feedback, /scan)');
      } catch (err: any) {
        logger.error(`Failed to register slash commands: ${err.message}`);
      }
    }
  });
}
