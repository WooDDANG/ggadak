import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { FakeDiscordAuth, fakeAuthOptions } from '../src/test-support/auth.js';
import { AppError } from '../src/errors/AppError.js';

test('successful login includes its already verified guilds without an immediate Discord token refresh', async () => {
  class Discord extends FakeDiscordAuth {
    override async refresh(): Promise<never> {
      throw new AppError('Provider temporarily unavailable', 502);
    }
  }
  const db = await isolatedRepository();
  const server = await createServer(db.repo, undefined, fakeAuthOptions(new Discord()));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  const base = `http://127.0.0.1:${address.port}/api/v1/auth`;
  try {
    const start = await fetch(`${base}/authorize`);
    const state = new URL((await start.json()).data.url).searchParams.get('state');
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: start.headers.get('set-cookie')!.split(';')[0],
      },
      body: JSON.stringify({ code: 'fixture', state }),
    });
    expect(login.status).toBe(200);
    expect((await login.json()).data.guilds.map((g: { id: string }) => g.id)).toEqual([
      'guild-1',
      'guild-2',
    ]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
