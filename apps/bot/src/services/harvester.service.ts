import { Message } from 'discord.js';
import { HarvestingPolicyConfig, createLogger } from '@ggaddak/shared';
import { RawMessageData } from '../context/builder.js';

const logger = createLogger('BOT-HARVESTER');

export class HarvesterService {
  async harvestContextMessages(
    message: Message,
    policy: HarvestingPolicyConfig,
  ): Promise<RawMessageData[]> {
    const channel = message.channel;
    if (!channel.isTextBased()) return [];

    const isThread = channel.isThread();
    const channelName = 'name' in channel ? (channel.name as string) : 'dm';

    let rawMessages: RawMessageData[] = [];

    // 1. Thread Prioritization: If in a Discord thread, fetch thread messages
    if (isThread) {
      logger.info(
        `[Context] Channel #${channelName} is a Discord Thread. Harvesting thread history...`,
      );
      const fetchedThread = await channel.messages.fetch({ limit: policy.maxMergedWindow });
      rawMessages = Array.from(fetchedThread.values())
        .reverse()
        .map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId,
        }));
    } else {
      // 2. Asymmetric Context Window Harvesting for standard channels (before N, after N)
      const beforeCount = policy.contextWindowBefore;
      const afterCount = policy.contextWindowAfter;

      const fetchedBefore = await channel.messages.fetch({
        limit: beforeCount,
        before: message.id,
      });
      const beforeMsgs = Array.from(fetchedBefore.values())
        .reverse()
        .map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId,
        }));

      const fetchedAfter = await channel.messages.fetch({ limit: afterCount, after: message.id });
      const afterMsgs = Array.from(fetchedAfter.values())
        .reverse()
        .map(m => ({
          id: m.id,
          authorId: m.author.id,
          authorName: m.author.username,
          content: m.content,
          createdAt: m.createdAt,
          referenceMessageId: m.reference?.messageId,
        }));

      rawMessages = [
        ...beforeMsgs,
        {
          id: message.id,
          authorId: message.author.id,
          authorName: message.author.username,
          content: message.content,
          createdAt: message.createdAt,
        },
        ...afterMsgs,
      ];
    }

    // Limit to maxMergedWindow
    if (rawMessages.length > policy.maxMergedWindow) {
      rawMessages = rawMessages.slice(-policy.maxMergedWindow);
    }

    return rawMessages;
  }
}
