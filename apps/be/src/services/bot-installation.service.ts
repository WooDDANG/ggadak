import { Service } from 'typedi';
import { DiscordBotInstallationAdapter } from '../adapters/discord-bot-installation.adapter.js';
import { BotInstallationStatusDto } from '../dto/bot-installation.dto.js';

export interface BotInstallationServiceOptions {
  clientId?: string;
  now?: () => number;
}

@Service()
export class BotInstallationService {
  constructor(
    private adapter: DiscordBotInstallationAdapter,
    private options: BotInstallationServiceOptions = {},
  ) {}

  async getStatus(guildId: string, canManage: boolean): Promise<BotInstallationStatusDto> {
    const checkedAt = new Date((this.options.now ?? Date.now)()).toISOString();
    const status = await this.adapter.observeBotMembership(guildId);

    let installUrl: string | null = null;
    if (status === 'not_installed' && canManage) {
      installUrl = await this.buildInstallUrl(guildId);
    }

    return {
      guildId,
      status,
      canManage,
      installUrl,
      checkedAt,
    };
  }

  private async buildInstallUrl(guildId: string): Promise<string | null> {
    const configuredClientId = this.options.clientId ?? process.env.DISCORD_CLIENT_ID ?? '';
    if (!configuredClientId || !/^\d+$/.test(configuredClientId)) {
      return null;
    }

    const verifiedAppId = await this.adapter.getApplicationId();
    if (!verifiedAppId || !/^\d+$/.test(verifiedAppId)) {
      return null;
    }

    // Configured client ID must match verified application ID from Discord API
    if (configuredClientId !== verifiedAppId) {
      return null;
    }

    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', configuredClientId);
    url.searchParams.set('scope', 'bot applications.commands');
    url.searchParams.set('permissions', '66624');
    url.searchParams.set('guild_id', guildId);
    url.searchParams.set('disable_guild_select', 'true');
    url.searchParams.set('integration_type', '0');
    return url.toString();
  }
}
