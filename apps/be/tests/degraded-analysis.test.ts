import { expect, test } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { DiscussionService } from '../src/services/discussion.service.js';
import { DecisionExtractorCore } from '../src/engine/extractor-core.js';
import type { IAiAdapter } from '../src/domain/ai-analysis.js';
import { AnalysisQueueService } from '../src/services/analysis-queue.service.js';

test('잘못된 관계를 기록하고 남은 후보를 검증해 저장한다', async () => {
  const db = await isolatedRepository();
  const ai: IAiAdapter = {
    async extractGraph() {
      return {
        value: {
          summary: '데이터베이스 결정',
          nodes: [
            {
              id: 'a',
              type: 'DecisionCandidate',
              summary: 'PostgreSQL 사용',
              category: '기타',
              observation: 'agreed',
              history: [{ observation: 'agreed', summary: '합의', at: null }],
            },
            {
              id: 'b',
              type: 'DecisionCandidate',
              summary: 'Redis 사용',
              category: '기타',
              observation: 'agreed',
              history: [{ observation: 'agreed', summary: '합의', at: null }],
            },
          ],
          edges: [{ id: 'bad', type: 'triggers', sourceId: 'a', targetId: 'b' }],
          discussionProblems: [],
        },
      };
    },
    async verifyGraph(_transcript, graph) {
      expect((graph as { edges: unknown[] }).edges).toEqual([]);
      return { value: { valid: true, issues: [] } };
    },
    async repairGraph() {
      throw new Error('Repair가 불필요합니다');
    },
  };
  try {
    const service = new DiscussionService(db.repo, ai, new DecisionExtractorCore());
    const result = await service.analyzeDiscussion({
      requestId: 'damaged-graph',
      guildId: 'g',
      channelId: 'c',
      isManualOverride: true,
      rawMessages: [
        { id: '1', author: 'Lee', content: 'PostgreSQL과 Redis를 사용하기로 합의했습니다.' },
      ],
    });
    expect(result.decisions).toHaveLength(2);
    const snapshot = await service.getGraph('damaged-graph', 'g');
    expect(snapshot.sessions[0]).toMatchObject({
      damage: [
        {
          requestId: 'damaged-graph',
          edge: { id: 'bad', type: 'triggers', sourceId: 'a', targetId: 'b' },
          sourceType: 'DecisionCandidate',
          targetType: 'DecisionCandidate',
          reason: 'invalid-type',
        },
      ],
    });
  } finally {
    await db.cleanup();
  }
});

test('30일 후 원본 재분석을 막고 실패 세션의 메시지 ID와 사유를 유지한다', async () => {
  const db = await isolatedRepository();
  const value = {
    summary: '고립된 근거',
    nodes: [{ id: 'reason', type: 'Rationale', summary: '비용 절감' }],
    edges: [],
    discussionProblems: [],
  };
  const service = new DiscussionService(
    db.repo,
    {
      extractGraph: async () => ({ value }),
      repairGraph: async () => ({ value }),
      verifyGraph: async () => {
        throw new Error('구조 검증에서 실패해야 합니다.');
      },
    },
    new DecisionExtractorCore(),
  );
  const params = {
    requestId: 'expiring',
    guildId: 'g',
    channelId: 'c',
    rawMessages: [{ id: '1', author: 'Lee', content: 'PostgreSQL을 사용하기로 합의했습니다.' }],
  };
  try {
    await service.analyzeDiscussion(params, {
      scanRange: { afterMessageId: '0', startMessageId: '1', endMessageId: '1' },
    });
    const expiresAt = (
      await db.client.analysisSessionRecovery.findFirstOrThrow()
    ).expiresAt.getTime();
    const request = await db.client.analysisRequest.findUniqueOrThrow({
      where: { id: params.requestId },
    });
    expect(expiresAt - request.createdAt.getTime()).toBe(30 * 24 * 60 * 60 * 1_000);
    const queue = new AnalysisQueueService(db.repo, service, {}, () => expiresAt);
    await queue.cleanup();
    expect((await service.getStatus(params.requestId, 'g')).sessions[0]).toMatchObject({
      recovery: { state: 'expired' },
      skippedFailure: { messageIds: ['1'], kind: 'graph-structure' },
    });
    expect((await db.client.analysisSessionState.findFirstOrThrow()).inputJson).not.toContain(
      'PostgreSQL',
    );
  } finally {
    await db.cleanup();
  }
});
