import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

test('Channel settings loads a server selection, saves it through generated authenticated API, and renders inaccessible channels', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ggaddak-fe-channels-'));
  const outfile = join(dir, 'flow.mjs');
  await build({ stdin: { contents: `
    export { listDiscordChannels, saveDiscordChannels } from './api/generated';
    export { setAccessToken } from './api/session';
    export { ChannelSettings } from './features/ChannelSettings';
    export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    export { renderToString } from 'react-dom/server';
    export { createElement } from 'react';
  `, resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, platform: 'node', format: 'esm', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, outfile });
  const flow = await import(pathToFileURL(outfile));
  const previousFetch = globalThis.fetch;
  const requests = [];
  const settings = { channels: [{ id: 'c1', guildId: 'g1', name: 'decisions', type: 0, accessible: true }, { id: 'c2', guildId: 'g1', name: 'private', type: 0, accessible: false }], monitoredChannelIds: ['c1'] };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ success: true, data: settings }); };
  try {
    flow.setAccessToken('user-token');
    const loaded = await flow.listDiscordChannels({ guildId: 'g1' });
    assert.deepEqual(loaded.data.data.monitoredChannelIds, ['c1']);
    await flow.saveDiscordChannels({ channelIds: ['c1'] }, { guildId: 'g1' });
    assert.equal(requests[1].url, '/api/v1/discord/channels?guildId=g1');
    assert.equal(requests[1].options.method, 'PUT');
    assert.deepEqual(JSON.parse(requests[1].options.body), { channelIds: ['c1'] });
    assert.equal(requests[1].options.headers.get('Authorization'), 'Bearer user-token');
    const cache = new flow.QueryClient(); cache.setQueryData(['discord-channels', 'g1'], settings);
    const markup = flow.renderToString(flow.createElement(flow.QueryClientProvider, { client: cache }, flow.createElement(flow.ChannelSettings, { guildId: 'g1' }))).replaceAll('<!-- -->', '');
    assert.match(markup, /#decisions/); assert.match(markup, /#private/); assert.match(markup, /봇 접근 불가/); assert.match(markup, /disabled/); assert.match(markup, /설정 저장/);
    cache.clear();
  } finally { globalThis.fetch = previousFetch; await rm(dir, { recursive: true, force: true }); }
});
