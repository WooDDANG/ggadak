import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DiscussionHarvester, RawMessageData } from './services/harvester.service.js';
import { DEFAULT_HARVESTING_POLICY, Decision } from '@ggaddak/shared';

describe('DiscussionHarvester Deep Module', () => {
  it('harvests asymmetric context window (before 15, after 5) in text channels', async () => {
    const harvester = new DiscussionHarvester({
      analyzeDiscussion: async () => ({ found: false, decisions: [] }),
      getCheckpoint: async () => null,
      saveCheckpoint: async () => true,
    } as any);

    const mockMessages: any[] = [];
    for (let i = 1; i <= 30; i++) {
      mockMessages.push({
        id: `msg-${i}`,
        author: { id: `user-${i}`, username: `member${i}` },
        content: `Message ${i}`,
        createdAt: new Date(2026, 8, 30, 10, i),
      });
    }

    const triggerMsg = mockMessages[19]; // msg-20 (0-indexed 19)

    const mockChannel = {
      id: 'chan-123',
      name: 'dev-discuss',
      isTextBased: () => true,
      isThread: () => false,
      messages: {
        fetch: async (opts: any) => {
          if (opts.before) {
            // Discord API returns messages before target in descending order (newest first)
            const targetIdx = mockMessages.findIndex(m => m.id === opts.before);
            const slice = mockMessages.slice(Math.max(0, targetIdx - opts.limit), targetIdx);
            return new Map(slice.reverse().map(m => [m.id, m]));
          }
          if (opts.after) {
            // Discord API returns messages in descending order (newest first)
            const targetIdx = mockMessages.findIndex(m => m.id === opts.after);
            const slice = mockMessages.slice(targetIdx + 1, targetIdx + 1 + opts.limit);
            return new Map(slice.reverse().map(m => [m.id, m]));
          }
          return new Map();
        },
      },
      send: async () => ({ id: 'bot-embed-1' }),
    };

    triggerMsg.channel = mockChannel;

    const harvested = await harvester.harvestContextMessages(triggerMsg, DEFAULT_HARVESTING_POLICY);
    assert.strictEqual(harvested.length, 21); // 15 before + 1 trigger + 5 after
    assert.strictEqual(harvested[0].id, 'msg-5');
    assert.strictEqual(harvested[15].id, 'msg-20');
    assert.strictEqual(harvested[20].id, 'msg-25');
  });

  it('acquires in-flight lock and rejects concurrent duplicate analyses on the same channel', async () => {
    let analyzeCallCount = 0;
    const harvester = new DiscussionHarvester({
      analyzeDiscussion: async () => {
        analyzeCallCount++;
        await new Promise(r => setTimeout(r, 50));
        return { found: true, decisions: [{ id: 'DEC-1' }] as any };
      },
      getCheckpoint: async () => null,
      saveCheckpoint: async () => true,
    } as any);

    const mockChannel = {
      id: 'chan-locked',
      name: 'general',
      isTextBased: () => true,
      isThread: () => false,
      messages: {
        fetch: async () => new Map(),
      },
      send: async () => ({}),
    };

    const msg: any = {
      id: 'msg-trig',
      channelId: 'chan-locked',
      channel: mockChannel,
      author: { id: 'u1', username: 'alex', bot: false },
      content: '결정합시다',
      createdAt: new Date(),
      url: 'https://discord.com/channels/1/2/3',
    };

    // First call acquires lock
    const p1 = harvester.processAnalysis(msg, DEFAULT_HARVESTING_POLICY, false);
    // Second concurrent call on same channel without manual override
    const p2 = harvester.processAnalysis(msg, DEFAULT_HARVESTING_POLICY, false);

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.ok(res1 !== null);
    assert.strictEqual(res2, null); // skipped by lock
    assert.strictEqual(analyzeCallCount, 1);
  });

  it('CONSENSUS_REGEX accurately matches agreement phrases and ignores casual talk', async () => {
    const { CONSENSUS_REGEX } = await import('./bot/client.js');

    assert.ok(CONSENSUS_REGEX.test('그럼 PostgreSQL로 합시다!'));
    assert.ok(CONSENSUS_REGEX.test('Fastify로 결정되었습니다.'));
    assert.ok(CONSENSUS_REGEX.test('Supabase Auth 도입 확정'));
    assert.ok(CONSENSUS_REGEX.test('오늘 스택 픽스하시죠'));
    assert.ok(CONSENSUS_REGEX.test('이 방향으로 진행할게요'));
    assert.ok(CONSENSUS_REGEX.test('다들 agree 하시나요?'));

    assert.strictEqual(CONSENSUS_REGEX.test('오늘 점심 뭐 드실래요?'), false);
    assert.strictEqual(CONSENSUS_REGEX.test('날씨가 너무 춥네요'), false);
    assert.strictEqual(CONSENSUS_REGEX.test('안녕하세요 반갑습니다'), false);
  });

  it('triggers message handler on semantic decision phrases even without strict keywords', async () => {
    const { MessageHandler } = await import('./handlers/message.handler.js');
    let triggerCount = 0;
    let reactionCount = 0;

    const fakeEngine = {
      harvest: async () => {
        triggerCount++;
        return { success: true, decisions: [], decisionsCount: 0, messageCount: 1 };
      },
    };

    const handler = new MessageHandler(
      fakeEngine as any,
      async (_msg: any, emoji: string) => {
        if (emoji === '👀') reactionCount++;
      },
    );

    const semanticMsg: any = {
      id: 'sem-1',
      author: { bot: false },
      channelId: 'chan-sem',
      channel: { name: 'dev' },
      content: '우리는 메인 데이터베이스로 PostgreSQL을 도입하기로 합의했습니다',
    };

    await handler.handleMessage(semanticMsg, {
      ...DEFAULT_HARVESTING_POLICY,
      debounceMs: 5,
    });

    assert.strictEqual(reactionCount, 1);
    assert.strictEqual(triggerCount, 1);
  });

  it('DecisionHarvestingEngine encapsulates debounce and locks concurrent channel events', async () => {
    const { DecisionHarvestingEngine } = await import('./services/decision-harvesting-engine.js');
    let sinkCalls = 0;
    const fakeSink = {
      analyzeDiscussion: async () => {
        sinkCalls++;
        await new Promise(r => setTimeout(r, 20));
        return { found: true, decisions: [{ id: 'DEC-ENG-1' }] };
      },
    };

    const engine = new DecisionHarvestingEngine(fakeSink);

    const testMsg: any = {
      id: 'msg-eng-1',
      channelId: 'chan-deep-engine',
      content: '테스트 합의 문장',
    };

    // First call acquires in-flight lock (manual override to bypass debounce)
    const p1 = engine.harvest({ type: 'EVENT', message: testMsg, isManualOverride: true });
    // Second concurrent call on same channel is deduplicated/locked
    const p2 = engine.harvest({ type: 'EVENT', message: testMsg, isManualOverride: false });

    const [res1, res2] = await Promise.all([p1, p2]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.decisionsCount, 1);
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.summary, 'in-flight locked');
    assert.strictEqual(sinkCalls, 1);
  });

  it('DecisionHarvestingEngine properly resolves debounce timer on normal event triggers', async () => {
    const { DecisionHarvestingEngine } = await import('./services/decision-harvesting-engine.js');
    let sinkCalls = 0;
    const fakeSink = {
      analyzeDiscussion: async () => {
        sinkCalls++;
        return { found: true, decisions: [{ id: 'DEC-DEBOUNCE' }] };
      },
    };

    const engine = new DecisionHarvestingEngine(fakeSink);
    const testMsg: any = {
      id: 'msg-debounce-1',
      channelId: 'chan-debounce-test',
      content: '디바운스 테스트 문장',
    };

    const promise = engine.harvest(
      { type: 'EVENT', message: testMsg },
      { ...DEFAULT_HARVESTING_POLICY, debounceMs: 10 },
    );

    const result = await promise;
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.decisionsCount, 1);
    assert.strictEqual(sinkCalls, 1);
  });
});
