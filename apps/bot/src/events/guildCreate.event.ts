import { Events, Guild } from 'discord.js';
import { Client } from 'discordx';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { AnalysisService } from '../services/analysis.service.js';

const logger = createLogger('GUILD-CREATE-EVENT');

export function handleGuildCreateEvent(
  client: Client,
  analysisService: AnalysisService,
  getPolicy: () => HarvestingPolicyConfig,
) {
  client.on(Events.GuildCreate, async (guild: Guild) => {
    logger.info(
      `🎉 Bot invited to new Guild: ${guild.name} (${guild.id}). Starting full initial scan...`,
    );
    try {
      const policy = getPolicy();
      const result = await analysisService.scanGuild(guild, policy, { full: true });
      logger.info(
        `✅ Completed initial full scan for ${guild.name}: ${result.channelCount} channels, ${result.scannedCount} msgs scanned, ${result.decisionsCount} decisions extracted.`,
      );
    } catch (err: any) {
      logger.error(`Error during initial guild scan for ${guild.name}: ${err.message}`, {
        stack: err.stack,
      });
    }
  });
}
