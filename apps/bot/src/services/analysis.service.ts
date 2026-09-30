import { Client, Message, TextChannel } from 'discord.js';
import { Decision, HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { BotEmbedView } from '../views/embed.view.js';
import { BackendApiService } from './backend-api.service.js';
import { HarvesterService } from './harvester.service.js';
import { CONSENSUS_REGEX } from '../handlers/message.handler.js';

const logger = createLogger('ANALYSIS-SERVICE');

export interface ScanOptions {
  full?: boolean;
  hours?: number;
  limit?: number;
  initialOnly?: boolean;
}

export class AnalysisService {
  private static instance: AnalysisService | null = null;
  private inFlightChannels = new Set<string>();

  constructor(
    private backendApi: BackendApiService,
    private harvesterService: HarvesterService,
  ) {
    AnalysisService.instance = this;
  }

  public static getInstance(): AnalysisService | null {
    return AnalysisService.instance;
  }

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

  async scanChannel(
    channel: TextChannel,
    policy: HarvestingPolicyConfig,
    options: ScanOptions = {},
  ): Promise<{ scannedCount: number; decisionsCount: number }> {
    const channelName = channel.name;
    const lastCheckpoint = await this.backendApi.getCheckpoint(channel.id);

    if (options.initialOnly && lastCheckpoint) {
      logger.info(
        `[Scan] Channel #${channelName} already has checkpoint ${lastCheckpoint}. Skipping initial scan.`,
      );
      return { scannedCount: 0, decisionsCount: 0 };
    }

    const timeCutoff = options.hours ? Date.now() - options.hours * 60 * 60 * 1000 : null;
    let fetchedMessages: Message[] = [];

    // Incremental forward scan when checkpoint exists and full scan / hours not requested
    if (!options.full && !options.hours && lastCheckpoint) {
      let lastId = lastCheckpoint;
      while (true) {
        const batch = await channel.messages.fetch({ limit: 100, after: lastId });
        if (batch.size === 0) break;
        const sorted = Array.from(batch.values()).sort(
          (a, b) => a.createdTimestamp - b.createdTimestamp,
        );
        fetchedMessages.push(...sorted);
        lastId = sorted[sorted.length - 1].id;
        if (options.limit && fetchedMessages.length >= options.limit) break;
        if (batch.size < 100) break;
      }
    } else {
      // Full backward history or time-windowed scan
      let oldestId: string | undefined = undefined;
      let reachedCutoff = false;

      while (true) {
        const fetchOpts: { limit: number; before?: string } = { limit: 100 };
        if (oldestId) fetchOpts.before = oldestId;

        const batch = await channel.messages.fetch(fetchOpts);
        if (batch.size === 0) break;

        const items = Array.from(batch.values());
        for (const msg of items) {
          if (timeCutoff && msg.createdTimestamp < timeCutoff) {
            reachedCutoff = true;
            break;
          }
          fetchedMessages.push(msg);
        }

        if (reachedCutoff) break;
        if (options.limit && fetchedMessages.length >= options.limit) break;
        if (batch.size < 100) break;

        oldestId = items[items.length - 1].id;
      }

      // Sort chronologically (oldest to newest)
      fetchedMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    }

    if (options.limit && fetchedMessages.length > options.limit) {
      fetchedMessages = fetchedMessages.slice(-options.limit);
    }

    if (fetchedMessages.length === 0) {
      return { scannedCount: 0, decisionsCount: 0 };
    }

    logger.info(`[Scan] Scanning ${fetchedMessages.length} messages in #${channelName}...`);
    let decisionsFound = 0;

    for (const msg of fetchedMessages) {
      if (CONSENSUS_REGEX.test(msg.content)) {
        const decisions = await this.executeAnalysis(msg, policy, true);
        if (decisions && decisions.length > 0) {
          decisionsFound += decisions.length;
        }
      }
    }

    const newestMessage = fetchedMessages[fetchedMessages.length - 1];
    await this.backendApi.saveCheckpoint(channel.id, newestMessage.id);

    return { scannedCount: fetchedMessages.length, decisionsCount: decisionsFound };
  }

  async scanGuild(
    guild: { channels: { cache: Map<string, any> }; name: string },
    policy: HarvestingPolicyConfig,
    options: ScanOptions = {},
  ): Promise<{ channelCount: number; scannedCount: number; decisionsCount: number }> {
    let totalMessages = 0;
    let totalDecisions = 0;
    let channelCount = 0;

    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased || !channel.isTextBased() || (channel.isThread && channel.isThread()))
        continue;
      try {
        const textChannel = channel as TextChannel;
        const res = await this.scanChannel(textChannel, policy, options);
        totalMessages += res.scannedCount;
        totalDecisions += res.decisionsCount;
        channelCount++;
      } catch (err: any) {
        logger.warn(`[Scan] Error scanning #${channel.name}: ${err.message}`);
      }
    }

    return { channelCount, scannedCount: totalMessages, decisionsCount: totalDecisions };
  }

  async scanAllChannels(
    client: Client,
    policy: HarvestingPolicyConfig,
    options: ScanOptions = {},
  ): Promise<{ channelCount: number; scannedCount: number; decisionsCount: number }> {
    logger.info(
      `[Scan] Performing multi-channel scan across guilds (options=${JSON.stringify(options)})...`,
    );
    let totalMessages = 0;
    let totalDecisions = 0;
    let channelCount = 0;

    for (const guild of client.guilds.cache.values()) {
      const res = await this.scanGuild(guild, policy, options);
      totalMessages += res.scannedCount;
      totalDecisions += res.decisionsCount;
      channelCount += res.channelCount;
    }

    logger.info(
      `[Scan] Multi-channel scan complete: ${channelCount} channels, ${totalMessages} msgs, ${totalDecisions} decisions.`,
    );
    return { channelCount, scannedCount: totalMessages, decisionsCount: totalDecisions };
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
