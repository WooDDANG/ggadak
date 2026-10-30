import { DeliveryPolicy } from '@ggaddak/shared';
import { BotInstallationStatus } from '../dto/bot-installation.dto.js';

export type BotMembershipObservation = BotInstallationStatus;

export interface DiscordBotInstallationAdapter {
  observeBotMembership(guildId: string): Promise<BotMembershipObservation>;
  getApplicationId(): Promise<string | null>;
}

export class HttpDiscordBotInstallationAdapter implements DiscordBotInstallationAdapter {
  constructor(
    private botToken: string = process.env.DISCORD_BOT_TOKEN ?? '',
    private transport: typeof fetch = fetch,
  ) {}

  private async fetchDiscord(path: string): Promise<Response | null> {
    if (!this.botToken || !this.botToken.trim()) {
      return null;
    }
    try {
      const response = await this.transport(`https://discord.com/api/v10${path}`, {
        headers: {
          Authorization: `Bot ${this.botToken.trim()}`,
        },
        signal: AbortSignal.timeout(DeliveryPolicy.serviceTimeoutMs),
      });
      return response;
    } catch {
      return null;
    }
  }

  async observeBotMembership(guildId: string): Promise<BotMembershipObservation> {
    if (!this.botToken || !this.botToken.trim()) {
      return 'unknown';
    }

    // Step 1: Verify authenticated bot identity (must have valid snowflake id and bot: true)
    const identityRes = await this.fetchDiscord('/users/@me');
    if (!identityRes || !identityRes.ok) {
      return 'unknown';
    }
    const identity = await identityRes.json().catch(() => null);
    if (
      !identity ||
      typeof identity.id !== 'string' ||
      !/^\d+$/.test(identity.id) ||
      identity.bot !== true
    ) {
      return 'unknown';
    }

    // Step 2: Direct guild metadata observation
    const guildRes = await this.fetchDiscord(`/guilds/${encodeURIComponent(guildId)}`);
    if (!guildRes) {
      return 'unknown';
    }

    if (guildRes.status === 200) {
      const guild = await guildRes.json().catch(() => null);
      if (guild && typeof guild.id === 'string' && guild.id === guildId) {
        return 'installed';
      }
      return 'unknown';
    }

    if (guildRes.status === 404) {
      const errorBody = await guildRes.json().catch(() => null);
      if (errorBody && errorBody.code === 10004) {
        return 'not_installed';
      }
      return 'unknown';
    }

    return 'unknown';
  }

  async getApplicationId(): Promise<string | null> {
    if (!this.botToken || !this.botToken.trim()) {
      return null;
    }

    // Strictly fetch from /oauth2/applications/@me without speculative fallback to bot user ID
    const appRes = await this.fetchDiscord('/oauth2/applications/@me');
    if (appRes && appRes.ok) {
      const appData = await appRes.json().catch(() => null);
      if (appData && typeof appData.id === 'string' && /^\d+$/.test(appData.id)) {
        return appData.id;
      }
    }

    return null;
  }
}
