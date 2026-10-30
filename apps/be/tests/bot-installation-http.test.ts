import { test, expect, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import {
  DiscordBotInstallationAdapter,
  BotMembershipObservation,
} from '../src/adapters/discord-bot-installation.adapter.js';

test('GET /api/v1/discord/bot-status authenticates membership, derives canManage, and returns no-store envelope', async () => {
  const db = await isolatedRepository();
  const validClientId = '123456789012345678';
  let mockStatus: BotMembershipObservation = 'installed';
  let mockAppId: string | null = validClientId;
  let now = Date.now();
  const installedGuilds = new Set<string>();

  const mockAdapter: DiscordBotInstallationAdapter = {
    observeBotMembership: vi.fn(async (guildId: string) =>
      installedGuilds.has(guildId) ? 'installed' : mockStatus,
    ),
    getApplicationId: async () => mockAppId,
  };

  const authOptions = {
    ...fakeAuthOptions(undefined, () => now),
    config: {
      ...fakeAuthOptions().config!,
      clientId: validClientId,
    },
    botInstallationAdapter: mockAdapter,
  };

  const server = await createServer(db.repo, undefined, authOptions);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    // 1. Unauthenticated request -> 401
    const unauthRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`);
    expect(unauthRes.status).toBe(401);

    // Login as test user (member of guild-1 with owner/manage=32, member of guild-2 with owner=false/permissions=0)
    const { token } = await loginAsTestUser(base);
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Request for non-member guild -> 403
    const forbiddenRes = await fetch(
      `${base}/api/v1/discord/bot-status?guildId=non-existent-guild`,
      { headers },
    );
    expect(forbiddenRes.status).toBe(403);
    expect(mockAdapter.observeBotMembership).not.toHaveBeenCalled();
    expect((await fetch(`${base}/api/v1/discord/bot-status`, { headers })).status).toBe(400);

    // 3. Manager (guild-1) when bot is installed
    mockStatus = 'installed';
    const installedRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, {
      headers,
    });
    expect(installedRes.status).toBe(200);
    expect(installedRes.headers.get('cache-control')).toBe('no-store');
    const installedBody = (await installedRes.json()) as any;
    expect(installedBody.success).toBe(true);
    expect(installedBody.code).toBe('OK');
    expect(installedBody.data.guildId).toBe('guild-1');
    expect(installedBody.data.status).toBe('installed');
    expect(installedBody.data.canManage).toBe(true);
    expect(installedBody.data.installUrl).toBeNull();
    expect(typeof installedBody.data.checkedAt).toBe('string');

    // 4. Manager (guild-1) when bot is not installed -> installUrl provided
    mockStatus = 'not_installed';
    const notInstalledRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, {
      headers,
    });
    expect(notInstalledRes.status).toBe(200);
    expect(notInstalledRes.headers.get('cache-control')).toBe('no-store');
    const notInstalledBody = (await notInstalledRes.json()) as any;
    expect(notInstalledBody.data.status).toBe('not_installed');
    expect(notInstalledBody.data.canManage).toBe(true);
    expect(notInstalledBody.data.installUrl).not.toBeNull();

    const installUrl = new URL(notInstalledBody.data.installUrl);
    expect(installUrl.origin).toBe('https://discord.com');
    expect(installUrl.pathname).toBe('/oauth2/authorize');
    expect(installUrl.searchParams.get('client_id')).toBe(validClientId);
    expect(installUrl.searchParams.get('permissions')).toBe('66624');
    expect(installUrl.searchParams.get('scope')).toBe('bot applications.commands');
    expect(installUrl.searchParams.get('guild_id')).toBe('guild-1');
    expect(installUrl.searchParams.get('disable_guild_select')).toBe('true');
    expect(installUrl.searchParams.get('integration_type')).toBe('0');

    // 5. Ordinary member (guild-2) when bot is not installed -> installUrl must be null
    const memberRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-2`, { headers });
    expect(memberRes.status).toBe(200);
    const memberBody = (await memberRes.json()) as any;
    expect(memberBody.data.guildId).toBe('guild-2');
    expect(memberBody.data.status).toBe('not_installed');
    expect(memberBody.data.canManage).toBe(false);
    expect(memberBody.data.installUrl).toBeNull();

    // Installing in a different server must not change the selected server.
    installedGuilds.add('guild-2');
    const selectedUrl = `${base}/api/v1/discord/bot-status?guildId=guild-1`;
    const stillAbsent = await fetch(selectedUrl, { headers });
    expect(((await stillAbsent.json()) as any).data.status).toBe('not_installed');
    installedGuilds.add('guild-1');
    const freshPresence = await fetch(selectedUrl, { headers });
    expect(((await freshPresence.json()) as any).data.status).toBe('installed');
    installedGuilds.delete('guild-1');
    const removedAgain = await fetch(selectedUrl, { headers });
    expect(((await removedAgain.json()) as any).data.status).toBe('not_installed');

    // 6. Unknown observation state -> installUrl must be null even for manager
    mockStatus = 'unknown';
    const unknownRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, {
      headers,
    });
    expect(unknownRes.status).toBe(200);
    const unknownBody = (await unknownRes.json()) as any;
    expect(unknownBody.data.status).toBe('unknown');
    expect(unknownBody.data.canManage).toBe(true);
    expect(unknownBody.data.installUrl).toBeNull();
    // Installation onboarding does not gate existing authorized reads/reviews.
    expect((await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/api/v1/review-queue?guildId=guild-1`, { headers })).status).toBe(
      200,
    );

    // 7. Verification failure: appId mismatch -> installUrl must be null
    mockStatus = 'not_installed';
    mockAppId = '999999999999999999'; // Mismatches validClientId
    const mismatchRes = await fetch(`${base}/api/v1/discord/bot-status?guildId=guild-1`, {
      headers,
    });
    expect(mismatchRes.status).toBe(200);
    const mismatchBody = (await mismatchRes.json()) as any;
    expect(mismatchBody.data.status).toBe('not_installed');
    expect(mismatchBody.data.canManage).toBe(true);
    expect(mismatchBody.data.installUrl).toBeNull();
    now += 16 * 60 * 1000;
    const callsBeforeExpired = vi.mocked(mockAdapter.observeBotMembership).mock.calls.length;
    expect((await fetch(selectedUrl, { headers })).status).toBe(401);
    expect(mockAdapter.observeBotMembership).toHaveBeenCalledTimes(callsBeforeExpired);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    await db.cleanup();
  }
});
