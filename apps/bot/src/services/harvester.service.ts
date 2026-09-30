import { Client, Message, TextChannel } from 'discord.js';
import { Decision, HarvestingPolicyConfig, createLogger, calculateDiscussionScore } from '@ggaddak/shared';
import { BotEmbedView } from '../views/embed.view.js';
import { BackendApiService } from './backend-api.service.js';
import { CONSENSUS_REGEX } from '../handlers/message.handler.js';

const logger = createLogger('DISCUSSION-HARVESTER');

export interface RawMessageData {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  referenceMessageId?: string;
  reactionCount?: number;
  reactions?: Array<{ emoji: string; count: number }>;
  isTrigger?: boolean;
}

export interface ScanOptions {
  full?: boolean;
  hours?: number;
  limit?: number;
  initialOnly?: boolean;
}

export class DiscussionHarvester {
  private static instance: DiscussionHarvester | null = null;
  private inFlightChannels = new Set<string>();

  constructor(private backendApi: BackendApiService) {
    DiscussionHarvester.instance = this;
  }

  public static getInstance(): DiscussionHarvester | null {
    return DiscussionHarvester.instance;
  }

  private extractReactions(m: any): { reactionCount: number; reactions: Array<{ emoji: string; count: number }> } {
    const reactions = Array.from(m.reactions?.cache?.values() || []).map((r: any) => ({
      emoji: r.emoji?.name || 'emoji',
      count: r.count || 0,
    }));
    const reactionCount = reactions.reduce((sum, r) => sum + r.count, 0);
    return { reactionCount, reactions };
  }

  async harvestContextMessages(
    message: Message,
    policy: HarvestingPolicyConfig,
  ): Promise<RawMessageData[]> {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return [];

    const isThread = channel.isThread && channel.isThread();
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    let rawMessages: RawMessageData[] = [];

    if (isThread) {
      logger.info(`[Context] Channel #${channelName} is a Discord Thread. Harvesting thread history...`);
      const fetchedThread = await channel.messages.fetch({ limit: policy.maxMergedWindow });
      rawMessages = Array.from(fetchedThread.values())
        .reverse()
        .map(m => {
          const rx = this.extractReactions(m);
          return {
            id: m.id,
            authorId: m.author?.id || 'unknown',
            authorName: m.author?.username || 'unknown',
            content: m.content || '',
            createdAt: m.createdAt || new Date(),
            referenceMessageId: m.reference?.messageId,
            reactionCount: rx.reactionCount,
            reactions: rx.reactions,
            isTrigger: m.id === message.id,
          };
        });
    } else {
      const beforeCount = policy.contextWindowBefore;
      const afterCount = policy.contextWindowAfter;

      const fetchedBefore = await channel.messages.fetch({
        limit: beforeCount,
        before: message.id,
      });
      const beforeMsgs = Array.from(fetchedBefore.values())
        .reverse()
        .map(m => {
          const rx = this.extractReactions(m);
          return {
            id: m.id,
            authorId: m.author?.id || 'unknown',
            authorName: m.author?.username || 'unknown',
            content: m.content || '',
            createdAt: m.createdAt || new Date(),
            referenceMessageId: m.reference?.messageId,
            reactionCount: rx.reactionCount,
            reactions: rx.reactions,
            isTrigger: false,
          };
        });

      const fetchedAfter = await channel.messages.fetch({ limit: afterCount, after: message.id });
      const afterMsgs = Array.from(fetchedAfter.values())
        .reverse()
        .map(m => {
          const rx = this.extractReactions(m);
          return {
            id: m.id,
            authorId: m.author?.id || 'unknown',
            authorName: m.author?.username || 'unknown',
            content: m.content || '',
            createdAt: m.createdAt || new Date(),
            referenceMessageId: m.reference?.messageId,
            reactionCount: rx.reactionCount,
            reactions: rx.reactions,
            isTrigger: false,
          };
        });

      const triggerRx = this.extractReactions(message);
      rawMessages = [
        ...beforeMsgs,
        {
          id: message.id,
          authorId: message.author?.id || 'unknown',
          authorName: message.author?.username || 'unknown',
          content: message.content || '',
          createdAt: message.createdAt || new Date(),
          referenceMessageId: message.reference?.messageId,
          reactionCount: triggerRx.reactionCount,
          reactions: triggerRx.reactions,
          isTrigger: true,
        },
        ...afterMsgs,
      ];
    }

    if (rawMessages.length > policy.maxMergedWindow) {
      rawMessages = rawMessages.slice(-policy.maxMergedWindow);
    }

    return rawMessages;
  }

  async processAnalysis(
    message: Message,
    policy: HarvestingPolicyConfig,
    isManualOverride: boolean = false,
  ): Promise<Decision[] | null> {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return null;

    const channelId = channel.id;
    if (this.inFlightChannels.has(channelId) && !isManualOverride) {
      logger.info(`[Lock] Channel #${channelId} is already in-flight. Skipping duplicate trigger.`);
      return null;
    }

    this.inFlightChannels.add(channelId);
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    try {
      const rawMessages = await this.harvestContextMessages(message, policy);
      const participants = Array.from(new Set(rawMessages.map(m => m.authorName)));
      const totalReactions = rawMessages.reduce((sum, m) => sum + (m.reactionCount || 0), 0);
      const hasConsensusKeyword = rawMessages.some(m => CONSENSUS_REGEX.test(m.content));

      const scoreResult = calculateDiscussionScore({
        participantCount: participants.length,
        reactionsCount: totalReactions,
        messageCount: rawMessages.length,
        hasConsensusKeyword,
      });

      logger.info(
        `[Context] Harvested ${rawMessages.length} msgs for #${channelName}. Bot calculated score: ${scoreResult.score}/4.0 (${scoreResult.tier})`,
      );

      const result = await this.backendApi.analyzeDiscussion({
        rawMessages: rawMessages.map(m => ({
          id: m.id,
          author: m.authorName,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          replyingTo: m.referenceMessageId,
          reactionCount: m.reactionCount || 0,
          reactions: m.reactions || [],
          isTrigger: m.isTrigger || false,
        })),
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        channelName,
        triggerMessageId: message.id,
        messageUrl: message.url,
        score: scoreResult.score,
        participantCount: participants.length,
        reactionsCount: totalReactions,
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

      logger.info(
        `[Analyze] Successfully extracted ${result.decisions.length} decision(s) from #${channelName}. Added 📝 emoji reaction. (Silent mode: no channel message sent)`,
      );

      return result.decisions;
    } catch (err: any) {
      logger.error(`[Execution] Error during analysis: ${err.message}`, { stack: err.stack });
      await this.removeReactionSafely(message, '👀');
      return null;
    } finally {
      this.inFlightChannels.delete(channelId);
    }
  }

  // Alias for backward-compatible call sites
  async executeAnalysis(
    message: Message,
    policy: HarvestingPolicyConfig,
    isManualOverride: boolean = false,
  ): Promise<Decision[] | null> {
    return this.processAnalysis(message, policy, isManualOverride);
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
    const newestMessage = fetchedMessages[fetchedMessages.length - 1];
    const participants = Array.from(new Set(fetchedMessages.map(m => m.author?.username || 'unknown')));
    const totalReactions = fetchedMessages.reduce((sum, m) => {
      const rx = this.extractReactions(m);
      return sum + rx.reactionCount;
    }, 0);
    const hasConsensusKeyword = fetchedMessages.some(m => CONSENSUS_REGEX.test(m.content || ''));

    const scoreResult = calculateDiscussionScore({
      participantCount: participants.length,
      reactionsCount: totalReactions,
      messageCount: fetchedMessages.length,
      hasConsensusKeyword,
    });

    try {
      const result = await this.backendApi.analyzeDiscussion({
        rawMessages: fetchedMessages.map(m => {
          const rx = this.extractReactions(m);
          return {
            id: m.id,
            author: m.author?.username || 'unknown',
            content: m.content || '',
            createdAt: (m.createdAt || new Date()).toISOString(),
            replyingTo: m.reference?.messageId,
            reactionCount: rx.reactionCount,
            reactions: rx.reactions,
            isTrigger: m.id === newestMessage.id,
          };
        }),
        guildId: channel.guildId || undefined,
        channelId: channel.id,
        channelName,
        triggerMessageId: newestMessage.id,
        messageUrl: newestMessage.url,
        isManualOverride: true,
        score: scoreResult.score,
        participantCount: participants.length,
        reactionsCount: totalReactions,
      });

      if (result.found && result.decisions && result.decisions.length > 0) {
        decisionsFound = result.decisions.length;
      }
    } catch (err: any) {
      logger.error(`[Scan] Error analyzing scanned messages for #${channelName}: ${err.message}`);
    }

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
      if (message.react) await message.react(emoji);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to add '${emoji}' reaction: ${err.message}`);
    }
  }

  async removeReactionSafely(message: Message, emoji: string): Promise<void> {
    try {
      const existing = message.reactions?.cache?.find((r: any) => r.emoji.name === emoji);
      if (existing && existing.remove) {
        await existing.remove().catch(() => {});
      }
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to remove '${emoji}' reaction: ${err.message}`);
    }
  }
}

// Aliases for clean migration
export class HarvesterService extends DiscussionHarvester {}
export { DiscussionHarvester as AnalysisService };
