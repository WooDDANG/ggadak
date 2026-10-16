import { test, expect, vi } from 'vitest';
import { HttpDiscordAuthAdapter } from '../src/adapters/discord-auth.adapter.js';

test('confirmed Discord credential revocation is distinct from transient provider outages', async () => {
  const adapter = new HttpDiscordAuthAdapter('fixture-client', 'fixture-secret');
  try {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(adapter.refresh('fixture-refresh')).rejects.toMatchObject({ statusCode: 401 });
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_client' }, { status: 401 }));
    await expect(adapter.refresh('fixture-refresh')).rejects.toMatchObject({ statusCode: 502 });
    vi.stubGlobal('fetch', async () => Response.json({ error: 'server_error' }, { status: 503 }));
    await expect(adapter.refresh('fixture-refresh')).rejects.toMatchObject({ statusCode: 502 });
    vi.stubGlobal('fetch', async () => {
      throw new Error('Network unavailable');
    });
    await expect(adapter.refresh('fixture-refresh')).rejects.toMatchObject({ statusCode: 502 });
  } finally {
    vi.unstubAllGlobals();
  }
});
