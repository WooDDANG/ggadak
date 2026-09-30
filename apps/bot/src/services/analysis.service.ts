import { Client, Message, TextChannel } from 'discord.js';
import { Decision, HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { BotEmbedView } from '../views/embed.view.js';
import { BackendApiService } from './backend-api.service.js';
import { HarvesterService } from './harvester.service.js';
import { CONSENSUS_REGEX } from '../handlers/message.handler.js';

const logger = createLogger('ANALYSIS-SERVICE');

export class AnalysisService {
  private inFlightChannels = new Set<string>();

  constructor(
    private backendApi: BackendApiService,
    private harvesterService: HarvesterService,
  ) {}

  async executeAnalysis(
    message: Message,
    policy: HarvestingPolicyConfig,
    isManualOverride: boolean = false,
  ): Promise<Decision[] | null> {
    const channel = message.channel;
    if (!channel.isTextBased()) return null;

    const channelId = channel.id;
    if (this.inFlightChannels.has(channelId) && !isManualOverride) {
      logger.info(`[Lock] Channel #${channelId} is already in-flight. Skipping duplicate trigger.`);
      return null;
    }

    this.inFlightChannels.add(channelId);
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    try {
      const rawMessages = await this.harvesterService.harvestContextMessages(message, policy);

      logger.info(
        `[Context] Harvested ${rawMessages.length} messages for #${channelName}. Sending to Backend AI...`,
      );

      const result = await this.backendApi.analyzeDiscussion({
        rawMessages: rawMessages.map(m => ({
          id: m.id,
          author: m.authorName,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          replyingTo: m.referenceMessageId,
        })),
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        channelName,
        triggerMessageId: message.id,
        messageUrl: message.url,
      });

      if (!result.found || !result.decisions || result.decisions.length === 0) {
        logger.info(
          `[Analyze] No new decision candidate found in #${channelName}. (${result.summary})`,
        );
        await this.removeReactionSafely(message, '👀');
        return null;
      }

      await this.removeReactionSafely(message, '👀');
      await this.addReactionSafely(message, '📝');

      // Post Draft candidate embeds
      if ('send' in channel && typeof (channel as any).send === 'function') {
        const sendableChannel = channel as { send: (options: any) => Promise<any> };
        for (const dec of result.decisions as Decision[]) {
          const embed = BotEmbedView.renderCandidateEmbed(dec, rawMessages.length);
          await sendableChannel.send({ embeds: [embed] });
        }

        // Check conflict / pivot prompt
        if (result.hasConflict && result.conflictingDecision && result.decisions.length > 0) {
          const newDec = result.decisions[0];
          const oldDec = result.conflictingDecision;
          const conflictEmbed = BotEmbedView.renderConflictEmbed(newDec, oldDec);
          const actionRow = BotEmbedView.renderConflictActionRow(newDec.id, oldDec.id);
          await sendableChannel.send({ embeds: [conflictEmbed], components: [actionRow] });
        }
      }

      return result.decisions;
    } catch (err: any) {
      logger.error(`[Execution] Error during analysis: ${err.message}`, { stack: err.stack });
      await this.removeReactionSafely(message, '👀');
      return null;
    } finally {
      this.inFlightChannels.delete(channelId);
    }
  }

  async scanAllChannels(
    client: Client,
    policy: HarvestingPolicyConfig,
    limit: number = 50,
  ): Promise<void> {
    logger.info(`[Scan] Performing scan across guilds with limit=${limit}...`);
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased() || channel.isThread()) continue;

        try {
          const textChannel = channel as TextChannel;
          const lastCheckpoint = await this.backendApi.getCheckpoint(channel.id);

          const fetchOptions: { limit: number; after?: string } = { limit };
          if (lastCheckpoint) {
            fetchOptions.after = lastCheckpoint;
          }

          const messages = await textChannel.messages.fetch(fetchOptions);
          if (messages.size === 0) continue;

          const sorted = Array.from(messages.values()).sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp,
          );
          const newestMessage = sorted[sorted.length - 1];

          for (const msg of sorted) {
            if (CONSENSUS_REGEX.test(msg.content)) {
              await this.executeAnalysis(msg, policy, true);
              break;
            }
          }

          await this.backendApi.saveCheckpoint(channel.id, newestMessage.id);
        } catch (err: any) {
          logger.warn(`[Scan] Skipping channel #${channel.name}: ${err.message}`);
        }
      }
    }
  }

  async addReactionSafely(message: Message, emoji: string): Promise<void> {
    try {
      await message.react(emoji);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to add '${emoji}' reaction: ${err.message}`);
    }
  }

  async removeReactionSafely(message: Message, emoji: string): Promise<void> {
    try {
      const existing = message.reactions?.cache.find(r => r.emoji.name === emoji);
      if (existing) {
        await existing.remove().catch(() => {});
      }
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to remove '${emoji}' reaction: ${err.message}`);
    }
  }
}
