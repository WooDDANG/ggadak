import { describe, it, expect, vi } from 'vitest';
import { BotInstallationService } from '../src/services/bot-installation.service.js';
import { DiscordBotInstallationAdapter } from '../src/adapters/discord-bot-installation.adapter.js';

describe('BotInstallationService', () => {
  const targetGuildId = '123456789012345678';
  const validClientId = '987654321098765432';
  const fixedNow = 1730290000000;
  const fixedIso = new Date(fixedNow).toISOString();

  it('returns status installed and installUrl null when bot is installed', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('installed'),
      getApplicationId: vi.fn().mockResolvedValue(validClientId),
    };
    const service = new BotInstallationService(adapter, {
      clientId: validClientId,
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result).toEqual({
      guildId: targetGuildId,
      status: 'installed',
      canManage: true,
      installUrl: null,
      checkedAt: fixedIso,
    });
  });

  it('returns status unknown and installUrl null when observation is unknown', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('unknown'),
      getApplicationId: vi.fn().mockResolvedValue(validClientId),
    };
    const service = new BotInstallationService(adapter, {
      clientId: validClientId,
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result).toEqual({
      guildId: targetGuildId,
      status: 'unknown',
      canManage: true,
      installUrl: null,
      checkedAt: fixedIso,
    });
  });

  it('returns status not_installed and installUrl null when user cannot manage the guild', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue(validClientId),
    };
    const service = new BotInstallationService(adapter, {
      clientId: validClientId,
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, false);
    expect(result).toEqual({
      guildId: targetGuildId,
      status: 'not_installed',
      canManage: false,
      installUrl: null,
      checkedAt: fixedIso,
    });
  });

  it('returns status not_installed and valid installUrl when absent, canManage is true, and configured clientId matches verified application ID', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue(validClientId),
    };
    const service = new BotInstallationService(adapter, {
      clientId: validClientId,
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result.status).toBe('not_installed');
    expect(result.canManage).toBe(true);
    expect(result.checkedAt).toBe(fixedIso);
    expect(result.installUrl).not.toBeNull();

    const parsedUrl = new URL(result.installUrl!);
    expect(parsedUrl.origin).toBe('https://discord.com');
    expect(parsedUrl.pathname).toBe('/oauth2/authorize');
    expect(parsedUrl.searchParams.get('client_id')).toBe(validClientId);
    expect(parsedUrl.searchParams.get('scope')).toBe('bot applications.commands');
    expect(parsedUrl.searchParams.get('permissions')).toBe('66624');
    expect(parsedUrl.searchParams.get('guild_id')).toBe(targetGuildId);
    expect(parsedUrl.searchParams.get('disable_guild_select')).toBe('true');
    expect(parsedUrl.searchParams.get('integration_type')).toBe('0');
  });

  it('regression: returns installUrl null when application ID verification fails (getApplicationId returns null)', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue(null),
    };
    const service = new BotInstallationService(adapter, {
      clientId: validClientId,
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result.status).toBe('not_installed');
    expect(result.installUrl).toBeNull();
  });

  it('regression: returns installUrl null if configured clientId is not set', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue(validClientId),
    };
    const service = new BotInstallationService(adapter, {
      clientId: '',
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result.status).toBe('not_installed');
    expect(result.installUrl).toBeNull();
  });

  it('returns installUrl null if configured clientId is invalid non-snowflake', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue('invalid-client-id'),
    };
    const service = new BotInstallationService(adapter, {
      clientId: 'invalid-client-id',
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result.status).toBe('not_installed');
    expect(result.installUrl).toBeNull();
  });

  it('returns installUrl null if configured clientId mismatches adapter application ID', async () => {
    const adapter: DiscordBotInstallationAdapter = {
      observeBotMembership: vi.fn().mockResolvedValue('not_installed'),
      getApplicationId: vi.fn().mockResolvedValue('111111111111111111'),
    };
    const service = new BotInstallationService(adapter, {
      clientId: '222222222222222222',
      now: () => fixedNow,
    });

    const result = await service.getStatus(targetGuildId, true);
    expect(result.status).toBe('not_installed');
    expect(result.installUrl).toBeNull();
  });
});
