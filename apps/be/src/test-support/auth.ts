import { AuthOptions } from '../services/auth.service.js';
import { DiscordAuthAdapter, DiscordGuild } from '../adapters/discord-auth.adapter.js';
export const testAuthConfig = { clientId: 'test', clientSecret: 'test', redirectUri: 'http://localhost:5173/', secret: '0123456789abcdef0123456789abcdef', secureCookie: false };
export class FakeDiscordAuth implements DiscordAuthAdapter {
  availableGuilds: DiscordGuild[] = [{ id: 'guild-1', name: 'First server', icon: null, owner: true, permissions: '32' }, { id: 'guild-2', name: 'Second server', icon: null, owner: false, permissions: '0' }];
  async exchange() { return { access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 3600 }; }
  async refresh() { return this.exchange(); }
  async identity() { return { id: 'user-1', username: 'Tester', avatar: null }; }
  async guilds() { return this.availableGuilds; }
}
export function fakeAuthOptions(adapter = new FakeDiscordAuth(), now?: () => number): AuthOptions { return { config: testAuthConfig, discordAdapter: adapter, now }; }
export async function loginAsTestUser(baseUrl: string) {
  const start = await fetch(`${baseUrl}/api/v1/auth/authorize`);
  const cookie = start.headers.get('set-cookie')!.split(';')[0];
  const state = new URL((await start.json() as any).data.url).searchParams.get('state');
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ code: 'valid-code', state }) });
  if (response.status !== 200) throw new Error(`Test login failed: ${response.status}`);
  return { token: (await response.json() as any).data.accessToken as string, cookie, state };
}
