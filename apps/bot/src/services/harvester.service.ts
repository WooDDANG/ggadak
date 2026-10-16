import { Client, Message, TextChannel } from 'discord.js';
import {
  Decision,
  HarvestingPolicyConfig,
  createLogger,
  calculateDiscussionScore,
} from '@ggaddak/shared';
import {
  AnalysisDeliveryError,
  BackendApiService,
  type SyncScanManifest,
} from './backend-api.service.js';
import { CONSENSUS_REGEX } from '../handlers/message.handler.js';
import { ChannelTransfer } from './channel-transfer.js';

const logger = createLogger('DISCUSSION-HARVESTER');

export interface RawMessageData {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  isBot?: boolean;
  referenceMessageId?: string;
  reactionCount?: number;
  reactions?: Array<{ emoji: string; count: number }>;
  isTrigger?: boolean;
}

export interface ScanOptions {
  jobId?: string;
  jobOwner?: string;
  lookbackDays?: number;
  full?: boolean;
  hours?: number;
  limit?: number;
  initialOnly?: boolean;
  forceFullSync?: boolean;
  requestId?: string;
}

export class ScanIncompleteError extends Error {
  constructor(
    public readonly completed: number,
    public readonly pending: number,
    public readonly failed: number,
    detail: string,
  ) {
    super(
      `Scan incomplete: ${completed} completed, ${pending} pending, ${failed} failed. ${detail}`,
    );
  }
}

export class DiscussionHarvester {
  private static instance: DiscussionHarvester | null = null;

  constructor(private backendApi: BackendApiService) {
    DiscussionHarvester.instance = this;
  }

  public static getInstance(): DiscussionHarvester | null {
    return DiscussionHarvester.instance;
  }

  private extractReactions(m: any): {
    reactionCount: number;
    reactions: Array<{ emoji: string; count: number }>;
  } {
    const reactions = Array.from(m.reactions?.cache?.values() || []).map((r: any) => ({
      emoji: r.emoji?.name || 'emoji',
      count: Math.max(0, (r.count || 0) - (r.me ? 1 : 0)),
    }));
    const reactionCount = reactions.reduce((sum, r) => sum + r.count, 0);
    return { reactionCount, reactions };
  }

  private async harvestContextMessages(
    message: Message,
    policy: HarvestingPolicyConfig,
  ): Promise<RawMessageData[]> {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return [];

    const isThread = channel.isThread && channel.isThread();
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    let rawMessages: RawMessageData[] = [];

    if (isThread) {
      logger.info(
        `[Context] Channel #${channelName} is a Discord Thread. Harvesting thread history...`,
      );
      const threadLimit = Math.min(100, policy.maxMergedWindow);
      const fetchedThread = await channel.messages.fetch({ limit: threadLimit });
      rawMessages = Array.from(fetchedThread.values())
        .reverse()
        .map(m => {
          const rx = this.extractReactions(m);
          return {
            id: m.id,
            authorId: m.author?.id || 'unknown',
            authorName: m.author?.username || 'unknown',
            isBot: m.author?.bot || false,
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
            isBot: m.author?.bot || false,
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
            isBot: m.author?.bot || false,
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
          isBot: message.author?.bot || false,
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

    const maxLimit = isThread ? 100 : policy.maxMergedWindow;
    if (rawMessages.length > maxLimit) {
      rawMessages = rawMessages.slice(-maxLimit);
    }

    return rawMessages;
  }

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
  async processAnalysis(
    message: Message,
    policy: HarvestingPolicyConfig,
    isManualOverride: boolean = false,
    traceId?: string,
    triggers: Message[] = [message],
  ): Promise<Decision[] | null | { accepted: true; requestId: string }> {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return null;
    if (!(await this.backendApi.isMonitoredChannel(message.guildId, channel.id))) return null;

    const currentTraceId =
      traceId || `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    try {
      const harvestStart = Date.now();
      const rawMessages = await this.harvestContextMessages(message, policy);
      for (const trigger of triggers) {
        const existing = rawMessages.find(m => m.id === trigger.id);
        if (existing) existing.isTrigger = true;
        else
          rawMessages.push({
            id: trigger.id,
            authorId: trigger.author?.id || 'unknown',
            authorName: trigger.author?.username || 'unknown',
            isBot: trigger.author?.bot || false,
            content: trigger.content || '',
            createdAt: trigger.createdAt || new Date(),
            referenceMessageId: trigger.reference?.messageId,
            ...this.extractReactions(trigger),
            isTrigger: true,
          });
      }
      rawMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const harvestDuration = Date.now() - harvestStart;
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
        `Harvested ${rawMessages.length} msgs for #${channelName} (Participants=${participants.length}, Rx=${totalReactions})`,
        {
          stage: 'HARVEST',
          traceId: currentTraceId,
          durationMs: harvestDuration,
          channel: channelName,
          score: scoreResult.score,
        },
      );

      const beStart = Date.now();
      const result = await this.backendApi.analyzeDiscussion(
        {
          rawMessages: rawMessages.map(m => ({
            id: m.id,
            author: m.authorName,
            isBot: m.isBot || false,
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
          isManualOverride,
          traceId: currentTraceId,
          score: scoreResult.score,
          participantCount: participants.length,
          reactionsCount: totalReactions,
        },
        () => this.addReactionSafely(message, '👀'),
        undefined,
        async result => {
          await this.removeReactionSafely(message, '👀');
          await this.removeReactionSafely(message, '⚠️');
          if (result?.found && result.decisions.length) await this.addReactionSafely(message, '📝');
        },
      );
      const beDuration = Date.now() - beStart;
      if (result.accepted) return { accepted: true, requestId: result.requestId };

      if (!result.found || !result.decisions || result.decisions.length === 0) {
        logger.info(
          `No decision candidate confirmed in #${channelName} (${result.summary}). Silent cleanup 👀 emoji.`,
          {
            stage: 'HARVEST',
            traceId: currentTraceId,
            durationMs: beDuration,
            summary: result.summary,
          },
        );
        return null;
      }

      const totalDuration = Date.now() - startTime;
      logger.info(
        `Extracted ${result.decisions.length} decision(s) from #${channelName}. Added 📝 emoji reaction.`,
        {
          stage: 'HARVEST',
          traceId: currentTraceId,
          durationMs: totalDuration,
          decisionCount: result.decisions.length,
          decisions: result.decisions.map((d: any) => d.title || d.topic),
        },
      );

      return result.decisions;
    } catch (err: any) {
      logger.error(`Error during discussion analysis: ${err.message}`, {
        stage: 'HARVEST',
        traceId: currentTraceId,
        stack: err.stack,
      });
      throw err;
    }
  }

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
  async scanChannel(
    channel: TextChannel,
    policy: HarvestingPolicyConfig,
    options: ScanOptions = {},
  ): Promise<{ scannedCount: number; decisionsCount: number; pendingAnalysis?: boolean }> {
    if (!(await this.backendApi.requireMonitoredChannel(channel.guild.id, channel.id)))
      return { scannedCount: 0, decisionsCount: 0 };
    if (this.backendApi.asyncDelivery)
      return new ChannelTransfer(this.backendApi).run(channel, {
        ...options,
        lookbackDays: policy.lookbackDays,
        limit: options.limit ?? (options.initialOnly ? policy.initialScanLimit : undefined),
      });
    const scanId = options.requestId
      ? `${options.requestId}:${channel.guild.id}:${channel.id}`
      : undefined;
    if (scanId) {
      const saved = await this.backendApi.loadSyncScan(scanId);
      if (saved) return this.executeScan(saved);
    }
    const channelName = channel.name;
    await this.backendApi
      .recoverScanCheckpoints()
      .catch(error => logger.warn(`Checkpoint acknowledgement retained: ${error.message}`));
    const lastCheckpoint = await this.backendApi.getCheckpoint(channel.id);

    if (options.initialOnly && lastCheckpoint) {
      await this.backendApi.recoverScanCheckpoints();
      logger.info(
        `[Scan] Channel #${channelName} already has checkpoint ${lastCheckpoint}. Skipping initial scan.`,
      );
      return { scannedCount: 0, decisionsCount: 0 };
    }

    const pendingBoundary = await this.backendApi.getScanBoundary(channel.id, lastCheckpoint);
    const incremental = !options.full && !options.hours && !options.forceFullSync;
    const boundary = incremental ? pendingBoundary || lastCheckpoint : null;
    const timeCutoff = options.hours
      ? Date.now() - options.hours * 3600000
      : options.initialOnly
        ? Date.now() - policy.lookbackDays * 86400000
        : null;
    const limit = options.limit ?? (options.initialOnly ? policy.initialScanLimit : undefined);
    let fetchedMessages: Message[] = [];
    let before: string | undefined;
    while (true) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      const items = [...batch.values()].sort((a, b) =>
        BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0,
      );
      fetchedMessages.push(
        ...items.filter(
          m =>
            (!boundary || BigInt(m.id) > BigInt(boundary)) &&
            (!timeCutoff || m.createdTimestamp >= timeCutoff),
        ),
      );
      const oldest = items[0];
      if (
        (boundary && BigInt(oldest.id) <= BigInt(boundary)) ||
        (timeCutoff && oldest.createdTimestamp < timeCutoff) ||
        batch.size < 100 ||
        (!boundary && limit && fetchedMessages.length >= limit)
      )
        break;
      if (before === oldest.id) throw new Error('Discord pagination did not advance');
      before = oldest.id;
    }
    fetchedMessages = [...new Map(fetchedMessages.map(m => [m.id, m])).values()].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0,
    );
    if (limit)
      fetchedMessages = boundary ? fetchedMessages.slice(0, limit) : fetchedMessages.slice(-limit);

    if (fetchedMessages.length === 0) {
      await this.backendApi.recoverScanCheckpoints();
      return { scannedCount: 0, decisionsCount: 0 };
    }

    let afterMessageId = boundary || (BigInt(fetchedMessages[0].id) - 1n).toString();
    const manifest: SyncScanManifest = { scannedCount: fetchedMessages.length, entries: [] };
    for (let offset = 0; offset < fetchedMessages.length; offset += 100) {
      const messages = fetchedMessages.slice(offset, offset + 100);
      const newest = messages[messages.length - 1];
      const scanRange = { afterMessageId, startMessageId: messages[0].id, endMessageId: newest.id };
      const participants = new Set(messages.map(m => m.author?.id || m.author?.username));
      const reactionsCount = messages.reduce(
        (sum, m) => sum + this.extractReactions(m).reactionCount,
        0,
      );
      manifest.entries.push({
        payload: {
          requestId: options.requestId ? `${options.requestId}:${newest.id}` : undefined,
          rawMessages: messages.map(m => ({
            id: m.id,
            author: m.author?.username || 'unknown',
            isBot: m.author?.bot || false,
            content: m.content || '',
            createdAt: m.createdAt.toISOString(),
            replyingTo: m.reference?.messageId,
            ...this.extractReactions(m),
            isTrigger: m.id === newest.id,
          })),
          guildId: channel.guild.id,
          channelId: channel.id,
          channelName,
          triggerMessageId: newest.id,
          messageUrl: newest.url,
          isManualOverride: options.forceFullSync === true,
          participantCount: participants.size,
          reactionsCount,
        },
        scanRange,
      });
      afterMessageId = newest.id;
    }
    const saved = scanId ? await this.backendApi.saveSyncScan(scanId, manifest) : manifest;
    return this.executeScan(saved);
  }

  private async executeScan(
    manifest: SyncScanManifest,
  ): Promise<{ scannedCount: number; decisionsCount: number }> {
    let decisionsFound = 0;
    const failures: Error[] = [];
    for (const entry of manifest.entries) {
      try {
        const result = await this.backendApi.analyzeDiscussion(
          entry.payload,
          undefined,
          entry.scanRange,
        );
        decisionsFound += result.decisions.length;
      } catch (error) {
        failures.push(error as Error);
      }
    }
    await this.backendApi.recoverScanCheckpoints();
    if (failures.length) {
      const pending = failures.filter(
        error => error instanceof AnalysisDeliveryError && error.outcome === 'retry-pending',
      ).length;
      throw new ScanIncompleteError(
        manifest.entries.length - failures.length,
        pending,
        failures.length - pending,
        failures[0].message,
      );
    }
    return { scannedCount: manifest.scannedCount, decisionsCount: decisionsFound };
  }

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
  async scanGuild(
    guild: { channels: { cache: Map<string, any> }; name: string },
    policy: HarvestingPolicyConfig,
    options: ScanOptions = {},
  ): Promise<{
    channelCount: number;
    scannedCount: number;
    decisionsCount: number;
    pendingAnalysis?: boolean;
  }> {
    let totalMessages = 0;
    let totalDecisions = 0;
    let channelCount = 0;
    let pendingAnalysis = false;
    const failures: string[] = [];
    let completedRanges = 0;
    let pendingRanges = 0;
    let failedRanges = 0;

    for (const channel of guild.channels.cache.values()) {
      if (
        !channel.isTextBased ||
        !channel.isTextBased() ||
        (channel.isThread && channel.isThread())
      )
        continue;
      try {
        const textChannel = channel as TextChannel;
        const res = await this.scanChannel(textChannel, policy, options);
        totalMessages += res.scannedCount;
        totalDecisions += res.decisionsCount;
        pendingAnalysis ||= res.pendingAnalysis === true;
        channelCount++;
        completedRanges += Math.ceil(res.scannedCount / 100);
      } catch (err: any) {
        logger.warn(`[Scan] Error scanning #${channel.name}: ${err.message}`);
        failures.push(`${channel.name}: ${err.message}`);
        if (err instanceof ScanIncompleteError) {
          completedRanges += err.completed;
          pendingRanges += err.pending;
          failedRanges += err.failed;
        } else failedRanges++;
      }
    }

    if (failures.length)
      throw new ScanIncompleteError(
        completedRanges,
        pendingRanges,
        failedRanges,
        failures.join('; '),
      );
    return {
      channelCount,
      scannedCount: totalMessages,
      decisionsCount: totalDecisions,
      pendingAnalysis,
    };
  }

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
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

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
  async addReactionSafely(message: Message, emoji: string, strict = false): Promise<void> {
    try {
      if (message.react) await message.react(emoji);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to add '${emoji}' reaction: ${err.message}`);
      if (strict) throw err;
    }
  }

  /** @internal Adapter operation; event and manual scan callers use engine.harvest(). */
  async removeReactionSafely(message: Message, emoji: string, strict = false): Promise<void> {
    try {
      const existing = message.reactions?.cache?.find((r: any) => r.emoji.name === emoji);
      const botId = message.client?.user?.id;
      if (existing && botId && existing.users?.remove) await existing.users.remove(botId);
    } catch (err: any) {
      logger.warn(`[Reaction] Failed to remove '${emoji}' reaction: ${err.message}`);
      if (strict) throw err;
    }
  }
}

// Aliases for clean migration
export class HarvesterService extends DiscussionHarvester {}
export { DiscussionHarvester as AnalysisService };
