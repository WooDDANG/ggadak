import { describe, it } from 'node:test';
import assert from 'node:assert';
import { disentangleConversations } from './disentangler.js';
import { CleanMessageItem } from './tier1-filter.js';

describe('Conversation Disentanglement to Causal Stream', () => {
  it('merges burst utterances by the same author within 60 seconds', () => {
    const baseTime = new Date('2026-10-08T10:00:00.000Z');
    const messages: CleanMessageItem[] = [
      {
        id: '1',
        author: 'alice',
        content: '우선 첫 번째 안건입니다.',
        createdAt: baseTime,
        reactionCount: 0,
      },
      {
        id: '2',
        author: 'alice',
        content: '인프라는 AWS ECS로 가시죠.',
        createdAt: new Date(baseTime.getTime() + 20000), // +20s
        reactionCount: 1,
      },
      {
        id: '3',
        author: 'bob',
        content: '좋은 생각입니다.',
        createdAt: new Date(baseTime.getTime() + 40000), // +40s
        reactionCount: 0,
      },
    ];

    const threads = disentangleConversations(messages);
    assert.strictEqual(threads.length, 1);
    const msgs = threads[0].messages;
    assert.strictEqual(msgs.length, 2);
    assert.ok(msgs[0].content.includes('첫 번째 안건'));
    assert.ok(msgs[0].content.includes('AWS ECS'));
    assert.strictEqual(msgs[0].reactionCount, 1);
  });

  it('separates two interleaved topics into distinct DisentangledThreads using reply links', () => {
    const baseTime = new Date('2026-10-08T10:00:00.000Z');
    const messages: CleanMessageItem[] = [
      // Topic A start
      { id: '1', author: 'alice', content: 'DB 뭐 쓸까요?', createdAt: baseTime, reactionCount: 0 },
      // Topic B start (interleaved)
      { id: '2', author: 'charlie', content: '오늘 점심 뭐 먹음?', createdAt: new Date(baseTime.getTime() + 10000), reactionCount: 0 },
      // Topic A reply (explicit reference to 1)
      {
        id: '3',
        author: 'bob',
        content: 'PostgreSQL로 결정합시다.',
        createdAt: new Date(baseTime.getTime() + 20000),
        referenceMessageId: '1',
        reactionCount: 2,
      },
      // Topic B reply (explicit reference to 2)
      {
        id: '4',
        author: 'david',
        content: '피자 먹으러 가요.',
        createdAt: new Date(baseTime.getTime() + 30000),
        referenceMessageId: '2',
        reactionCount: 1,
      },
    ];

    const threads = disentangleConversations(messages);
    assert.strictEqual(threads.length, 2);

    const topicA = threads.find(t => t.rootMessageId === '1');
    const topicB = threads.find(t => t.rootMessageId === '2');

    assert.ok(topicA);
    assert.ok(topicB);

    assert.strictEqual(topicA.messages.length, 2);
    assert.strictEqual(topicA.messages[0].id, '1');
    assert.strictEqual(topicA.messages[1].id, '3');

    assert.strictEqual(topicB.messages.length, 2);
    assert.strictEqual(topicB.messages[0].id, '2');
    assert.strictEqual(topicB.messages[1].id, '4');
  });

  it('branches into a new thread root when silence exceeds 2 minutes', () => {
    const baseTime = new Date('2026-10-08T10:00:00.000Z');
    const messages: CleanMessageItem[] = [
      { id: '1', author: 'alice', content: '오전 회의 종료합니다.', createdAt: baseTime, reactionCount: 0 },
      // 5 minutes later (> 2 min silence)
      {
        id: '2',
        author: 'bob',
        content: '오후 안건: 캐시 레이어 도입 건입니다.',
        createdAt: new Date(baseTime.getTime() + 300000),
        reactionCount: 0,
      },
    ];

    const threads = disentangleConversations(messages);
    assert.strictEqual(threads.length, 2);
    assert.strictEqual(threads[0].rootMessageId, '1');
    assert.strictEqual(threads[1].rootMessageId, '2');
  });
});
