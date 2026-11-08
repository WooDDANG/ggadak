import { AuthError } from '../errors/AuthError.js';
import { AppError } from '../errors/AppError.js';
import { createLogger } from '@ggaddak/shared';
const logger = createLogger('DISCORD-AUTH');
export interface DiscordIdentity {
  id: string;
  username: string;
  avatar: string | null;
}
export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}
export interface DiscordTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface DiscordAuthAdapter {
  exchange(code: string, redirectUri: string): Promise<DiscordTokens>;
  refresh(refreshToken: string): Promise<DiscordTokens>;
  identity(accessToken: string): Promise<DiscordIdentity>;
  guilds(accessToken: string): Promise<DiscordGuild[]>;
}
export class HttpDiscordAuthAdapter implements DiscordAuthAdapter {
  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(`https://discord.com/api/v10${path}`, {
        ...init,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        logger.warn('Discord authentication request rejected', {
          operation: path === '/oauth2/token' ? 'token' : 'user',
          status: response.status,
          errorCode: typeof body.error === 'string' ? body.error.slice(0, 80) : undefined,
        });
        if (
          (path !== '/oauth2/token' && response.status === 401) ||
          (path === '/oauth2/token' && response.status === 400 && body.error === 'invalid_grant')
        )
          throw new AuthError('Discord authorization expired; sign in again');
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const seconds = Number((body as { retry_after?: number }).retry_after ?? header);
          const retryAfterMs =
            (Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 30) * 1000;
          throw new AppError('Discord rate limited guild verification; retry shortly', 429, {
            retryAfterMs,
            global: Boolean((body as { global?: boolean }).global),
          });
        }
        throw new AppError('Discord authentication unavailable; retry shortly', 502);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Discord authentication unavailable; retry login', 502);
    }
  }
  private tokens(params: Record<string, string>) {
    return this.request<DiscordTokens>('/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...params,
      }),
    });
  }
  exchange(code: string, redirectUri: string) {
    return this.tokens({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }
  refresh(refreshToken: string) {
    return this.tokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }
  identity(token: string) {
    return this.request<DiscordIdentity>('/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  guilds(token: string) {
    return this.request<DiscordGuild[]>('/users/@me/guilds', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
