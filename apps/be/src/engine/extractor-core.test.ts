import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DecisionExtractorCore } from './extractor-core.js';

describe('DecisionExtractorCore - Slicing & Governance Rubric', () => {
  const core = new DecisionExtractorCore();

  it('slices a message stream into multiple sessions when a 30+ minute gap occurs', () => {
    const baseTime = new Date('2026-09-30T10:00:00Z').getTime();

    const messages = [
      // Session 1: 10:00 - 10:05
      { id: 'm1', author: 'wooddang', content: 'DB 뭐 쓸까요?', createdAt: new Date(baseTime).toISOString() },
      { id: 'm2', author: 'alex', content: 'Postgres 갑시다', createdAt: new Date(baseTime + 5 * 60 * 1000).toISOString() },
      // 40-minute gap!
      // Session 2: 10:45 - 10:50
      { id: 'm3', author: 'chris', content: '인증은 Supabase Auth로 결정하죠', createdAt: new Date(baseTime + 45 * 60 * 1000).toISOString() },
      { id: 'm4', author: 'wooddang', content: '좋습니다 진행할게요', createdAt: new Date(baseTime + 50 * 60 * 1000).toISOString() },
    ];

    const sessions = core.sliceMessagesByIdleGap(messages, 30);
    assert.strictEqual(sessions.length, 2);
    assert.strictEqual(sessions[0].length, 2);
    assert.strictEqual(sessions[1].length, 2);
    assert.strictEqual(sessions[0][0].id, 'm1');
    assert.strictEqual(sessions[1][0].id, 'm3');
  });

  it('calculates 4.0 Strong governance score for multi-participant consensus with rationale and action items', () => {
    const scoreResult = core.calculateGovernanceScore({
      participantCount: 3,
      reactionsCount: 3,
      rationale: 'PostgreSQL provides ACID transactions and robust SQL support for our analytics workload.',
      actionItemsCount: 1,
      hasExternalFeedback: true,
    });

    assert.strictEqual(scoreResult.score, 4.0);
    assert.strictEqual(scoreResult.strength, 'Strong');
    assert.strictEqual(scoreResult.passed, true);
  });

  it('calculates 2.0 Weak governance score for solo announcement without multi-participant consensus', () => {
    const scoreResult = core.calculateGovernanceScore({
      participantCount: 1,
      reactionsCount: 0,
      rationale: 'Personal preference for MongoDB.',
      actionItemsCount: 0,
      hasExternalFeedback: false,
    });

    assert.strictEqual(scoreResult.score, 2.0);
    assert.strictEqual(scoreResult.strength, 'Weak');
    assert.strictEqual(scoreResult.passed, false);
  });

  it('calculates 1.0 Incomplete governance score for vague/missing rationale', () => {
    const scoreResult = core.calculateGovernanceScore({
      participantCount: 1,
      reactionsCount: 0,
      rationale: '그냥',
      actionItemsCount: 0,
      hasExternalFeedback: false,
    });

    assert.strictEqual(scoreResult.score, 1.0);
    assert.strictEqual(scoreResult.strength, 'Incomplete');
    assert.strictEqual(scoreResult.passed, false);
  });
});
