import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DecisionSchema, DecisionPayloadSchema, DecisionStateSchema } from './schemas.js';

describe('Shared Domain Schemas', () => {
  it('validates a correct Decision object', () => {
    const validDecision = {
      id: 'DEC-001',
      topic: 'Database Selection',
      decision: 'Use PostgreSQL as primary DB',
      rationale: 'Requires ACID transactions and strong schema guarantees',
      actionItems: [{ task: 'Provision AWS RDS Postgres instance', assignee: 'alex' }],
      state: 'Decided',
      supersedesId: null,
      source: {
        guildId: 'guild-123',
        channelId: 'channel-456',
        channelName: 'dev-architecture',
        triggerMessageId: 'msg-789',
        messageUrl: 'https://discord.com/channels/123/456/789',
        participants: ['wooddang', 'alex'],
      },
      createdAt: '2026-09-28T14:00:00.000Z',
    };

    const parsed = DecisionSchema.parse(validDecision);
    assert.strictEqual(parsed.id, 'DEC-001');
    assert.strictEqual(parsed.state, 'Decided');
    assert.strictEqual(parsed.actionItems.length, 1);
  });

  it('validates a complete DecisionPayload object', () => {
    const payload = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: {
        id: 'DEC-002',
        topic: 'LLM Framework',
        decision: 'Adopt Vercel AI SDK',
        rationale: 'Provides unified TypeScript abstractions with Zod structured output',
        actionItems: [],
        state: 'Decided',
        supersedesId: null,
        source: {
          guildId: 'guild-123',
          channelId: 'channel-456',
          triggerMessageId: 'msg-999',
          participants: [],
        },
        createdAt: '2026-09-28T14:15:00.000Z',
      },
    };

    const parsed = DecisionPayloadSchema.parse(payload);
    assert.strictEqual(parsed.event, 'decision.recorded');
    assert.strictEqual(parsed.payload.topic, 'LLM Framework');
  });

  it('rejects invalid state', () => {
    assert.throws(() => {
      DecisionStateSchema.parse('InvalidState');
    });
  });

  it('calculates discussion consensus scores across tiers', async () => {
    const { calculateDiscussionScore } = await import('./score.js');

    // 4.0 Strong: 2+ participants, 2+ reactions, 3+ msgs
    const strong = calculateDiscussionScore({
      participantCount: 3,
      reactionsCount: 4,
      messageCount: 5,
      hasConsensusKeyword: true,
    });
    assert.strictEqual(strong.score, 4.0);
    assert.strictEqual(strong.tier, 'Strong');

    // 3.0 Standard: 2 participants, 0 reactions
    const standard = calculateDiscussionScore({
      participantCount: 2,
      reactionsCount: 0,
      messageCount: 2,
      hasConsensusKeyword: false,
    });
    assert.strictEqual(standard.score, 3.0);
    assert.strictEqual(standard.tier, 'Standard');

    // 2.0 Weak: 1 participant with consensus keyword
    const weak = calculateDiscussionScore({
      participantCount: 1,
      reactionsCount: 0,
      messageCount: 1,
      hasConsensusKeyword: true,
    });
    assert.strictEqual(weak.score, 2.0);
    assert.strictEqual(weak.tier, 'Weak');

    // 1.0 Incomplete
    const incomplete = calculateDiscussionScore({
      participantCount: 1,
      reactionsCount: 0,
      messageCount: 1,
      hasConsensusKeyword: false,
    });
    assert.strictEqual(incomplete.score, 1.0);
    assert.strictEqual(incomplete.tier, 'Incomplete');
  });

  it('evaluates semantic decision similarity for natural Korean & English agreement phrases with >= 0.70 threshold', async () => {
    const { evaluateDenseMultiAnchorSimilarity, evaluateSemanticDecision } = await import('./semantic-scorer.js');

    // 1. Natural phrasing with semantic alignment (>= 0.70)
    const r1 = evaluateDenseMultiAnchorSimilarity('우리 메인 DB는 PostgreSQL 도입으로 결정하시죠');
    assert.ok(r1.isCandidate, `Expected candidate, got sim=${r1.similarity}`);
    assert.ok(r1.similarity >= 0.70, `Expected >= 0.70, got ${r1.similarity}`);

    const r2 = evaluateDenseMultiAnchorSimilarity('서버 프레임워크는 Fastify로 확정하고 개발 진행하겠습니다');
    assert.ok(r2.isCandidate);
    assert.ok(r2.similarity >= 0.70);

    const r3 = evaluateDenseMultiAnchorSimilarity('이쪽 아키텍처 방향으로 가닥 잡고 진행합시다');
    assert.ok(r3.isCandidate);
    assert.ok(r3.similarity >= 0.70);

    const r4 = evaluateSemanticDecision('We decided to adopt PostgreSQL as primary database');
    assert.ok(r4.isCandidate);
    assert.ok(r4.similarity >= 0.70);

    // 2. Casual talk / irrelevant chatter should strictly score < 0.40 and not be candidate
    const casual1 = evaluateDenseMultiAnchorSimilarity('오늘 점심 메뉴 돈까스 어때요?');
    assert.strictEqual(casual1.isCandidate, false);
    assert.ok(casual1.similarity < 0.40, `Expected < 0.40, got ${casual1.similarity}`);

    const casual2 = evaluateDenseMultiAnchorSimilarity('주말에 영화 보러 가실 분 있나요');
    assert.strictEqual(casual2.isCandidate, false);
    assert.ok(casual2.similarity < 0.40, `Expected < 0.40, got ${casual2.similarity}`);
  });
});
