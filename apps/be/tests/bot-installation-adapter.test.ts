import { describe, it, expect, vi } from 'vitest';
import { HttpDiscordBotInstallationAdapter } from '../src/adapters/discord-bot-installation.adapter.js';

describe('DiscordBotInstallationAdapter', () => {
  const botToken = 'valid-test-bot-token';
  const targetGuildId = '123456789012345678';
  const botUserId = '999999999999999999';

  it('returns unknown when botToken is empty or missing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = new HttpDiscordBotInstallationAdapter('', fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns installed when bot identity has bot: true and guild metadata returns 200 with matching guildId', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith(`/guilds/${targetGuildId}`)) {
        return new Response(JSON.stringify({ id: targetGuildId, name: 'Target Guild' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('installed');
  });

  it('returns unknown when bot identity returns a user that does not have bot: true', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'NotABot', bot: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
  });

  it('returns not_installed only when bot identity is valid with bot: true and guild returns 404 with Discord error code 10004 (Unknown Guild)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith(`/guilds/${targetGuildId}`)) {
        return new Response(JSON.stringify({ code: 10004, message: 'Unknown Guild' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('not_installed');
  });

  it('returns unknown when guild returns 404 without explicit code 10004 (generic 404 / HTML)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith(`/guilds/${targetGuildId}`)) {
        return new Response('<html>404 Not Found</html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
  });

  it('returns unknown when bot identity fails with 401 Unauthorized', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ message: '401: Unauthorized', code: 0 }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
  });

  it('returns unknown when guild returns 403 Forbidden', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith(`/guilds/${targetGuildId}`)) {
        return new Response(JSON.stringify({ code: 50001, message: 'Missing Access' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
  });

  it('returns unknown when guild metadata id does not match targetGuildId', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith(`/guilds/${targetGuildId}`)) {
        return new Response(JSON.stringify({ id: 'different-guild-id', name: 'Other' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const status = await adapter.observeBotMembership(targetGuildId);
    expect(status).toBe('unknown');
  });

  it('retrieves application ID via oauth2/applications/@me when available', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/oauth2/applications/@me')) {
        return new Response(JSON.stringify({ id: '987654321098765432', name: 'GGADDAK' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const appId = await adapter.getApplicationId();
    expect(appId).toBe('987654321098765432');
  });

  it('returns null when oauth2/applications/@me fails and does not fall back to bot user id', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.endsWith('/users/@me')) {
        return new Response(JSON.stringify({ id: botUserId, username: 'GGADDAK_BOT', bot: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Forbidden', { status: 403 });
    });

    const adapter = new HttpDiscordBotInstallationAdapter(botToken, fetchMock);
    const appId = await adapter.getApplicationId();
    expect(appId).toBeNull();
  });
});

describe('Discord installation failure classification', () => {
  const guildId = '123456789012345678';
  const identity = () => Response.json({ id: '999999999999999999', bot: true });
  const cases: [string, () => Response][] = [
    ['rate limited', () => Response.json({ code: 0 }, { status: 429 })],
    ['upstream failure', () => Response.json({ code: 0 }, { status: 500 })],
    ['malformed guild JSON', () => new Response('{', { status: 200 })],
    ['null guild', () => Response.json(null)],
  ];
  it.each(cases)('keeps %s unknown rather than declaring absence', async (_name, response) => {
    const adapter = new HttpDiscordBotInstallationAdapter('test-token', async input =>
      String(input).endsWith('/users/@me') ? identity() : response(),
    );
    expect(await adapter.observeBotMembership(guildId)).toBe('unknown');
  });
  it.each(['identity', 'guild'])('handles rejected %s requests including timeouts', async stage => {
    const adapter = new HttpDiscordBotInstallationAdapter('test-token', async input => {
      if (stage === 'guild' && String(input).endsWith('/users/@me')) return identity();
      throw new DOMException('Timed out', 'TimeoutError');
    });
    expect(await adapter.observeBotMembership(guildId)).toBe('unknown');
  });
  it('does not query guilds after malformed identity JSON', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{'));
    const adapter = new HttpDiscordBotInstallationAdapter('test-token', transport);
    expect(await adapter.observeBotMembership(guildId)).toBe('unknown');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
