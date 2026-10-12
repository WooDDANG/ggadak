import { AppError } from '../errors/AppError.js';

export interface DiscordChannel { id: string; guildId: string; name: string; type: number; accessible: boolean; }
export interface DiscordChannelsAdapter { list(guildId: string): Promise<DiscordChannel[]>; }

/** Only guild text channels are supported; threads/forums need their own harvesting policy. */
export class HttpDiscordChannelsAdapter implements DiscordChannelsAdapter {
  constructor(private token = process.env.DISCORD_BOT_TOKEN ?? '', private transport: typeof fetch = fetch) {}
  private async get(path: string): Promise<any> {
    if (!this.token) throw new AppError('Discord bot is not configured', 503);
    const response = await this.transport(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${this.token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppError(response.status === 404 ? 'Bot is not installed in this server' : 'Discord bot cannot access this server', response.status === 403 || response.status === 404 ? 409 : 503);
    return response.json();
  }
  async list(guildId: string): Promise<DiscordChannel[]> {
    const guild = encodeURIComponent(guildId);
    const [channels, roles, member, info] = await Promise.all([this.get(`/guilds/${guild}/channels`), this.get(`/guilds/${guild}/roles`), this.get(`/guilds/${guild}/members/@me`), this.get(`/guilds/${guild}`)]);
    const roleIds = new Set<string>([guildId, ...member.roles]);
    const base = roles.filter((r: any) => roleIds.has(r.id)).reduce((p: bigint, r: any) => p | BigInt(r.permissions), 0n);
    return channels.map((channel: any) => {
      let permissions = base;
      if (info.owner_id === member.user.id || (base & 8n) !== 0n) permissions = (1n << 60n) - 1n;
      else {
        const overwrites = channel.permission_overwrites ?? [];
        const everyone = overwrites.find((o: any) => o.type === 0 && o.id === guildId);
        if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
        let deny = 0n, allow = 0n;
        for (const o of overwrites) if (o.type === 0 && o.id !== guildId && roleIds.has(o.id)) { deny |= BigInt(o.deny); allow |= BigInt(o.allow); }
        permissions = (permissions & ~deny) | allow;
        const own = overwrites.find((o: any) => o.type === 1 && o.id === member.user.id);
        if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
      }
      return { id: channel.id, guildId: channel.guild_id, name: channel.name, type: channel.type, accessible: channel.guild_id === guildId && channel.type === 0 && (permissions & 66560n) === 66560n };
    });
  }
}
