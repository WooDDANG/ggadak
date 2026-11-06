import { expect, test } from 'vitest';
import { HttpDiscordBotInstallationAdapter } from '../src/adapters/discord-bot-installation.adapter.js';

function adapter(pages: Array<unknown | Response>) {
  const paths: string[] = [];
  const transport: typeof fetch = async input => {
    const url = new URL(String(input));
    paths.push(url.pathname + url.search);
    if (url.pathname.endsWith('/users/@me')) return Response.json({ id: '123', bot: true });
    const page = pages.shift();
    return page instanceof Response ? page : Response.json(page ?? []);
  };
  return { instance: new HttpDiscordBotInstallationAdapter('fixture-token', transport), paths };
}

test('bulk inventory follows all pages and returns the complete list', async () => {
  const first = Array.from({ length: 200 }, (_, index) => ({ id: String(index + 1) })).reverse();
  const { instance, paths } = adapter([first, [{ id: '201' }]]);
  const ids = await instance.listInstalledGuilds();
  expect(ids).toHaveLength(201);
  expect(ids).toContain('201');
  expect(paths).toEqual([
    '/api/v10/users/@me',
    '/api/v10/users/@me/guilds?limit=200',
    '/api/v10/users/@me/guilds?limit=200&after=200',
  ]);
});

test('partial failure, malformed or repeating pages never become a complete empty inventory', async () => {
  const full = Array.from({ length: 200 }, (_, index) => ({ id: String(index + 1) }));
  for (const pages of [
    [full, new Response('', { status: 503 })],
    [full, full],
    [[{ id: 'invalid' }]],
    [{ unexpected: true }],
  ]) {
    expect(await adapter(pages).instance.listInstalledGuilds()).toBeNull();
  }
  expect(await adapter([[]]).instance.listInstalledGuilds()).toEqual([]);
});
