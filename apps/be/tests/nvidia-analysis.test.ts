import { expect, test } from 'vitest';
import type OpenAI from 'openai';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { NvidiaProvider } from '../src/adapters/nvidia-provider.js';
import { NvidiaKeyPool } from '../src/adapters/nvidia-key-pool.js';
import { AiAdapter } from '../src/adapters/ai.adapter.js';
import { DiscussionService } from '../src/services/discussion.service.js';
import { AnalysisQueueService } from '../src/services/analysis-queue.service.js';
import { DecisionExtractorCore } from '../src/engine/extractor-core.js';

test('계정 예산 대기는 시도를 소모하지 않고 저장된 Extract 다음 Verify부터 재개한다', async () => {
  const db = await isolatedRepository();
  let now = Date.now();
  let calls = 0;
  const client = {
    chat: {
      completions: {
        create: async (_: unknown, options: { maxRetries: number }) => {
          expect(options.maxRetries).toBe(0);
          const value =
            ++calls === 1
              ? { summary: '분석 완료', nodes: [], edges: [], discussionProblems: [] }
              : { valid: true, issues: [] };
          return (async function* () {
            yield { choices: [{ delta: { content: JSON.stringify(value) } }] };
          })();
        },
      },
    },
  } as unknown as OpenAI;
  const provider = new NvidiaProvider({
    keyPool: new NvidiaKeyPool(
      db.client,
      [{ name: 'NVIDIA_API_KEY_1', apiKey: 'secret' }],
      1,
      () => now,
    ),
    clientFactory: () => client,
  });
  const ai = new AiAdapter({ provider: 'nvidia' }, 'test', provider, () => {});
  const queue = new AnalysisQueueService(
    db.repo,
    new DiscussionService(db.repo, ai, new DecisionExtractorCore()),
    {},
    () => now,
  );
  const input = {
    requestId: 'key-budget',
    guildId: 'guild',
    channelId: 'channel',
    isManualOverride: true,
    rawMessages: [{ id: '1', author: 'Lee', content: 'Redis를 사용하기로 결정했습니다.' }],
  };
  try {
    await queue.receive({ input });
    await queue.runOnce();
    expect(calls).toBe(1);
    const [waiting] = await queue.results([input.requestId]);
    expect(waiting).toMatchObject({
      state: 'retry',
      attempts: 0,
      errorCategory: 'analysis-capacity',
    });
    expect(Date.parse(waiting.nextAttemptAt)).toBe(now + 60000);
    const state = await db.client.analysisSessionState.findFirstOrThrow();
    expect(JSON.parse(state.stateJson)).toMatchObject({ phase: 'verify', calls: ['extract'] });
    expect(JSON.parse(state.stateJson).attempts).toHaveLength(1);
    await queue.runOnce();
    expect(calls).toBe(1);
    now += 60000;
    await queue.runOnce();
    expect(calls).toBe(2);
    expect((await queue.results([input.requestId]))[0].state).toBe('completed');
  } finally {
    await db.cleanup();
  }
});
