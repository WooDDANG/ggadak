import { test, expect } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { DiscussionService } from '../src/services/discussion.service.js';
import { DecisionExtractorCore } from '../src/engine/extractor-core.js';
import { CONSENSUS_REGEX, evaluateSemanticDecision } from '@ggaddak/shared';

test('Korean and English semantic-only signals reach the production AI seam while Bot processing reactions do not admit noise', async () => {
  const db = await isolatedRepository();
  let calls = 0;
  const service = new DiscussionService(
    db.repo,
    {
      analyzeTranscript: async () => {
        calls++;
        return { found: false, summary: 'No decision', decisions: [] };
      },
    },
    new DecisionExtractorCore(),
  );
  try {
    for (const [index, content] of [
      '아키텍처 설계는 모듈러 모놀리스 구조로 가닥을 잡았습니다',
      'We have decided to adopt PostgreSQL as our primary database',
    ].entries()) {
      expect(CONSENSUS_REGEX.test(content)).toBe(false);
      expect(evaluateSemanticDecision(content).isCandidate).toBe(true);
      await service.analyzeDiscussion({
        requestId: `semantic-${index}`,
        guildId: 'guild',
        channelId: 'channel',
        rawMessages: [
          {
            id: String(index),
            author: 'Lee',
            content,
            createdAt: '2026-01-01T00:00:00Z',
            isTrigger: true,
          },
        ],
      });
    }
    expect(calls).toBe(2);
    await service.analyzeDiscussion({
      requestId: 'noise',
      guildId: 'guild',
      channelId: 'channel',
      rawMessages: [
        {
          id: '3',
          author: 'Lee',
          content: '오늘 점심 메뉴를 알려 주세요',
          createdAt: '2026-01-01T00:00:00Z',
          reactionCount: 4,
          reactions: [
            { emoji: '👀', count: 2, botCount: 2 },
            { emoji: '📝', count: 2, botCount: 2 },
          ],
        },
      ],
    });
    expect(calls).toBe(2);
    await expect(
      service.analyzeDiscussion({
        requestId: 'malformed',
        rawMessages: [{ id: 'bad', author: 'Lee', content: 'context', createdAt: 'bad' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.client.analysisRequest.findUnique({ where: { id: 'malformed' } })).toBeNull();
  } finally {
    await db.cleanup();
  }
});

test('checkpoint acknowledgements cannot regress across repository restart', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveCheckpoint('channel', '1400000000000000007');
    await db.repo.saveCheckpoint('channel', '1400000000000000006');
    expect(await db.repo.getCheckpoint('channel')).toBe('1400000000000000007');
  } finally {
    await db.cleanup();
  }
});

test('normal test entrypoint refuses external provider calls and an invalid ingestion cannot poison storage', async () => {
  await expect(fetch('https://generativelanguage.googleapis.com')).rejects.toThrow(
    /External network is disabled/,
  );
  const db = await isolatedRepository();
  const { DecisionService } = await import('../src/services/decision.service.js');
  try {
    await expect(
      new DecisionService(db.repo).saveDecision({ id: 'bad' } as any),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.client.decision.count()).toBe(0);
  } finally {
    await db.cleanup();
  }
});
