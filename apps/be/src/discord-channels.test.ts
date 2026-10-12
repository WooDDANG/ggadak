import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpDiscordChannelsAdapter } from './adapters/discord-channels.adapter.js';

test('Discord channel access uses bot identity and effective channel overwrite permissions', async () => {
  const responses: Record<string, unknown> = {
    '/users/@me': { id: 'bot' },
    '/guilds/g1': { owner_id: 'owner' },
    '/guilds/g1/members/bot': { user: { id: 'bot' }, roles: ['reader'] },
    '/guilds/g1/roles': [{ id: 'g1', permissions: '1024' }, { id: 'reader', permissions: '65536' }],
    '/guilds/g1/channels': [
      { id: 'allowed', guild_id: 'g1', name: 'allowed', type: 0 },
      { id: 'denied', guild_id: 'g1', name: 'denied', type: 0, permission_overwrites: [{ id: 'bot', type: 1, deny: '65536', allow: '0' }] },
      { id: 'thread', guild_id: 'g1', name: 'thread', type: 11 },
      { id: 'outside', guild_id: 'g2', name: 'outside', type: 0 },
    ],
  };
  const adapter = new HttpDiscordChannelsAdapter('token', async input => {
    const path = new URL(String(input)).pathname.replace('/api/v10', '');
    assert.ok(path in responses, `Unsupported Discord API path: ${path}`);
    return Response.json(responses[path]);
  });
  assert.deepEqual((await adapter.list('g1')).map(channel => [channel.id, channel.accessible]), [
    ['allowed', true], ['denied', false], ['thread', false], ['outside', false],
  ]);
});
