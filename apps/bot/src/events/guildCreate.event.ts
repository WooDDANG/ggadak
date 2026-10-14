import { Events, Guild } from 'discord.js';
import { Client } from 'discordx';
import { createLogger } from '@ggaddak/shared';

const logger = createLogger('GUILD-CREATE-EVENT');

export function handleGuildCreateEvent(client: Client) {
  client.on(Events.GuildCreate, (guild: Guild) => {
    logger.info(
      `🎉 Bot invited to new Guild: ${guild.name} (${guild.id}). Tracking new conversations; historical scans require a request.`,
    );
  });
}
