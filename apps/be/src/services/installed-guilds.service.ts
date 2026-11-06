import type { DiscordGuild } from '../adapters/discord-auth.adapter.js';
import type { DiscordGuildInventoryAdapter } from '../adapters/discord-bot-installation.adapter.js';
import type { GuildSelectionDto } from '../dto/auth.dto.js';
import { GuildAccessService } from './guild-access.service.js';

/** Bot presence selects workspaces; user membership remains the data authorization authority. */
export class InstalledGuildsService {
  private pending?: { revision: number; request: Promise<string[] | null> };
  constructor(
    private access: GuildAccessService,
    private adapter: DiscordGuildInventoryAdapter,
    private now: () => number = Date.now,
  ) {}

  private inventory(revision: number) {
    if (!this.pending || this.pending.revision !== revision) {
      const request = Promise.resolve()
        .then(() => this.adapter.listInstalledGuilds())
        .catch(() => null)
        .finally(() => {
          if (this.pending?.request === request) this.pending = undefined;
        });
      this.pending = { revision, request };
    }
    return this.pending.request;
  }

  async select(
    joined: DiscordGuild[],
    revision: number,
  ): Promise<{ guilds: DiscordGuild[]; guildSelection: GuildSelectionDto }> {
    if ((await this.access.revision()) !== revision)
      return { guilds: [], guildSelection: { status: 'unavailable', checkedAt: null } };
    if (!joined.length)
      return {
        guilds: [],
        guildSelection: { status: 'ready', checkedAt: new Date(this.now()).toISOString() },
      };
    const observed = await this.access.installationInventory();
    let installed: Set<string> | null;
    if (observed && !joined.some(guild => observed.get(guild.id) === 'unknown')) {
      installed = new Set(
        [...observed].filter(([, state]) => state === 'installed').map(([id]) => id),
      );
    } else {
      const inventory = await this.inventory(revision);
      installed = inventory === null ? null : new Set(inventory);
    }
    if (installed === null || (await this.access.revision()) !== revision) {
      return { guilds: [], guildSelection: { status: 'unavailable', checkedAt: null } };
    }
    return {
      guilds: joined.filter(guild => installed.has(guild.id)),
      guildSelection: { status: 'ready', checkedAt: new Date(this.now()).toISOString() },
    };
  }
}
