import { Events } from 'discord.js';
import { Client } from 'discordx';
import { createLogger } from '@ggaddak/shared';

const logger = createLogger('READY-EVENT');

export function handleReadyEvent(client: Client) {
  client.once(Events.ClientReady, async readyClient => {
    logger.info(`🤖 Logged in as ${readyClient.user.tag}`);
    try {
      await client.initApplicationCommands();
      logger.info('✌️ discordx automatically registered all @Slash() commands with Discord');
    } catch (err: any) {
      logger.warn(`Failed to auto-register discordx application commands: ${err.message}`);
    }

    logger.info('Tracking new conversations. Historical scans run only when requested.');
  });
}
