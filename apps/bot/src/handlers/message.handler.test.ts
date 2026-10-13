import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_HARVESTING_POLICY } from '@ggaddak/shared';
import { MessageHandler } from './message.handler.js';
import { BackendApiService } from '../services/backend-api.service.js';
import { DiscussionHarvester } from '../services/harvester.service.js';
import { DecisionHarvestingEngine } from '../services/decision-harvesting-engine.js';

test('monitored message candidates harvest through the pipeline with reaction-only feedback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'message-pipeline-'));
  const requests: any[] = [];
  const reactions: string[] = [];
  const api = new BackendApiService(
    'http://fixture',
    directory,
    async (url, init) => {
      if (String(url).includes('/internal/monitoring'))
        return Response.json({ data: { channelIds: ['selected'] } });
      const request = JSON.parse(init!.body as string);
      requests.push(request);
      return Response.json({ found: true, decisions: [{ id: 'candidate-1' }] });
    },
    undefined,
    'service',
  );
  const harvester = new DiscussionHarvester(api);
  const handler = new MessageHandler(
    new DecisionHarvestingEngine(api, harvester),
    (guildId, channelId) => api.isMonitoredChannel(guildId, channelId),
  );
  const channel: any = {
    id: 'selected',
    name: 'decisions',
    isTextBased: () => true,
    isThread: () => false,
    messages: { fetch: async () => new Map() },
    send: async () => {
      throw new Error('Automatic feedback must remain reaction-only');
    },
  };
  const message: any = {
    id: 'keyword',
    guildId: 'guild',
    channelId: 'selected',
    channel,
    author: { id: 'human', username: 'Lee', bot: false },
    content: 'PostgreSQL로 합시다',
    createdAt: new Date(0),
    reactions: { cache: { values: () => [].values(), find: () => undefined } },
    react: async (emoji: string) => {
      reactions.push(emoji);
    },
  };
  const policy = { ...DEFAULT_HARVESTING_POLICY, debounceMs: 0 };
  try {
    await handler.handleMessage({ ...message, author: { ...message.author, bot: true } }, policy);
    await handler.handleMessage({ ...message, channelId: 'unselected' }, policy);
    await handler.handleMessage({ ...message, content: '오늘 점심 뭐 드실래요?' }, policy);
    assert.equal(requests.length, 0);
    assert.equal(reactions.length, 0);

    await handler.handleMessage(message, policy);
    await handler.handleMessage(
      {
        ...message,
        id: 'semantic',
        content: 'We decided to adopt PostgreSQL as primary database',
      },
      policy,
    );
    assert.deepEqual(
      requests.map(request => request.triggerMessageId),
      ['keyword', 'semantic'],
    );
    assert.ok(requests.every(request => request.isManualOverride === false));
    assert.ok(requests.every(request => request.rawMessages[0].isTrigger === true));
    assert.deepEqual(reactions, ['👀', '📝', '👀', '📝']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
