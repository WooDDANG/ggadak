import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackendApiService } from './backend-api.service.js';
import { DiscussionHarvester } from './harvester.service.js';
import { DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';

test('Bot skips unselected channels and fails closed when settings cannot be refreshed', async () => {
  let available = true;
  const api = new BackendApiService(
    'http://backend',
    undefined,
    async (input, init) => {
      assert.equal(String(input), 'http://backend/api/v1/internal/monitoring?guildId=guild-1');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer service-test');
      return available
        ? Response.json({ data: { channelIds: ['selected'] } })
        : new Response('', { status: 503 });
    },
    undefined,
    'service-test',
  );
  {
    assert.equal(await api.isMonitoredChannel('guild-1', 'other'), false);
    assert.equal(await api.isMonitoredChannel('guild-1', 'selected'), true);
    available = false;
    assert.equal(await api.isMonitoredChannel('guild-1', 'selected'), false);
    const harvester = new DiscussionHarvester(api);
    const channel = {
      id: 'other',
      guild: { id: 'guild-1' },
      name: 'ignored',
      isTextBased: () => true,
      messages: {
        fetch: async () => {
          throw new Error('Unselected channel history must not be read');
        },
      },
    };
    await assert.rejects(harvester.scanChannel(channel as any, DEFAULT_HARVESTING_POLICY), /503/);
    available = true;
    assert.deepEqual(await harvester.scanChannel(channel as any, DEFAULT_HARVESTING_POLICY), {
      scannedCount: 0,
      decisionsCount: 0,
    });
    assert.equal(
      await harvester.processAnalysis(
        { channel, guildId: 'guild-1', channelId: 'other' } as any,
        DEFAULT_HARVESTING_POLICY,
      ),
      null,
    );
  }
});

test('Message and reaction triggers do not react or dispatch outside monitored channels', async () => {
  const { MessageHandler } = await import('../handlers/message.handler.js');
  const { ReactionHandler } = await import('../handlers/reaction.handler.js');
  const engine = {
    harvest: async () => {
      throw new Error('Unselected event must not dispatch');
    },
  };
  const addReaction = async () => {
    throw new Error('Unselected event must not react');
  };
  const allowed = async () => false;
  const message = {
    guildId: 'guild-1',
    channelId: 'other',
    author: { bot: false },
    content: '확정합시다',
    partial: false,
  };
  await new MessageHandler(engine as any, addReaction, allowed).handleMessage(
    message as any,
    DEFAULT_HARVESTING_POLICY,
  );
  await new ReactionHandler('📌', engine as any, addReaction, allowed).handleReactionAdd(
    { partial: false, message, emoji: { name: '📌' } } as any,
    { bot: false } as any,
    DEFAULT_HARVESTING_POLICY,
  );
});
