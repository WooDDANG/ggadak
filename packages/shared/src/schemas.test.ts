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
});
