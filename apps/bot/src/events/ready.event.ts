import { Events } from 'discord.js';
import { Client } from 'discordx';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { AnalysisService } from '../services/analysis.service.js';

const logger = createLogger('READY-EVENT');

export function handleReadyEvent(
  client: Client,
  analysisService: AnalysisService,
  getPolicy: () => HarvestingPolicyConfig,
  _token?: string,
) {
  client.once(Events.ClientReady, async readyClient => {
    logger.info(`🤖 Logged in as ${readyClient.user.tag}`);
    try {
      await client.initApplicationCommands();
      logger.info('✌️ discordx automatically registered all @Slash() commands with Discord');
    } catch (err: any) {
      logger.warn(`Failed to auto-register discordx application commands: ${err.message}`);
    }

    // Trigger initial scan for channels without checkpoints
    try {
      logger.info('🚀 Triggering initial full scan for new/uncheckpointed channels...');
      const policy = getPolicy();
      const result = await analysisService.scanAllChannels(client, policy, { initialOnly: true, full: true });
      logger.info(
        `✅ Initial scan finished: ${result.channelCount} channels checked, ${result.scannedCount} msgs scanned, ${result.decisionsCount} decisions extracted.`,
      );
    } catch (err: any) {
      logger.warn(`Initial auto-scan skipped or encountered warning: ${err.message}`);
    }
  });
}

