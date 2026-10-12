import { Service } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { DiscordChannelsAdapter, HttpDiscordChannelsAdapter } from '../adapters/discord-channels.adapter.js';
import { AppError } from '../errors/AppError.js';
@Service()
export class ChannelsService {
  constructor(private prisma: PrismaClient, private adapter: DiscordChannelsAdapter = new HttpDiscordChannelsAdapter()) {}
  async list(guildId: string) {
    const channels = await this.adapter.list(guildId);
    const settings = await this.prisma.monitoredChannel.findMany({ where: { guildId } });
    return { channels: channels.filter(c => c.guildId === guildId && c.type === 0), monitoredChannelIds: settings.map(c => c.id) };
  }
  async save(guildId: string, channelIds: string[]) {
    if (channelIds.length > 500 || new Set(channelIds).size !== channelIds.length) throw new AppError('Invalid channel selection', 400);
    const { channels } = await this.list(guildId);
    if (channelIds.some(id => !channels.some(c => c.id === id && c.accessible))) throw new AppError('Selected channel is outside this server or bot cannot read its history', 400);
    await this.prisma.$transaction(async tx => {
      await tx.monitoredChannel.deleteMany({ where: { guildId } });
      for (const id of channelIds) await tx.monitoredChannel.create({ data: { id, guildId, name: channels.find(c => c.id === id)!.name } });
    });
    return { channels, monitoredChannelIds: channelIds };
  }
  /** Revalidates Discord access on every read; bot never harvests stale permissions. */
  async monitored(guildId: string): Promise<string[]> {
    const { channels, monitoredChannelIds } = await this.list(guildId);
    return monitoredChannelIds.filter(id => channels.some(c => c.id === id && c.accessible));
  }
}
