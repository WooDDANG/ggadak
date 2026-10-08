import { describe, it } from 'node:test';
import assert from 'node:assert';
import { filterTier1Messages, RawMessageItem } from './tier1-filter.js';

describe('Tier 1 Zero-Cost Rule Filtering & Synthetic Reactions', () => {
  it('drops bot messages and command prefix messages', () => {
    const raw: RawMessageItem[] = [
      { id: '1', author: 'user1', isBot: true, content: 'Bot announcement', createdAt: new Date() },
      { id: '2', author: 'user2', isBot: false, content: '/help me configure', createdAt: new Date() },
      { id: '3', author: 'user3', isBot: false, content: '!deploy production', createdAt: new Date() },
      { id: '4', author: 'user4', isBot: false, content: '정상적인 업무 대화입니다.', createdAt: new Date() },
    ];

    const result = filterTier1Messages(raw);
    assert.strictEqual(result.cleanMessages.length, 1);
    assert.strictEqual(result.cleanMessages[0].id, '4');
    assert.strictEqual(result.filteredCount, 3);
  });

  it('normalizes standalone URL and attachment media into meta tags', () => {
    const raw: RawMessageItem[] = [
      {
        id: '1',
        author: 'designer',
        content: '',
        attachments: ['architecture-v1.png'],
        createdAt: new Date(),
      },
      {
        id: '2',
        author: 'pm',
        content: 'https://notion.so/spec/123',
        createdAt: new Date(),
      },
    ];

    const result = filterTier1Messages(raw);
    assert.strictEqual(result.cleanMessages.length, 2);
    assert.strictEqual(result.cleanMessages[0].content, '[Attachment: architecture-v1.png]');
    assert.strictEqual(result.cleanMessages[1].content, '[Link: https://notion.so/spec/123]');
  });

  it('absorbs short agreement phrases into preceding message as synthetic reactions', () => {
    const raw: RawMessageItem[] = [
      { id: '1', author: 'lead', content: '데이터베이스로 PostgreSQL을 채택합시다.', createdAt: new Date() },
      { id: '2', author: 'dev1', content: 'ㅇㅋ', createdAt: new Date() },
      { id: '3', author: 'dev2', content: '동의합니다', createdAt: new Date() },
      { id: '4', author: 'dev3', content: '👍', createdAt: new Date() },
      { id: '5', author: 'dev4', content: '좋습니다', createdAt: new Date() },
    ];

    const result = filterTier1Messages(raw);
    assert.strictEqual(result.cleanMessages.length, 1);
    assert.strictEqual(result.cleanMessages[0].id, '1');
    assert.strictEqual(result.syntheticReactions['1'], 4);
    assert.strictEqual(result.cleanMessages[0].reactionCount, 4);
  });

  it('drops casual chatter and empty exclamations', () => {
    const raw: RawMessageItem[] = [
      { id: '1', author: 'u1', content: 'ㅋㅋㅋ', createdAt: new Date() },
      { id: '2', author: 'u2', content: 'ㅠㅠㅠ', createdAt: new Date() },
      { id: '3', author: 'u3', content: '헐 대박', createdAt: new Date() },
      { id: '4', author: 'u4', content: '배포 일정 공유합니다.', createdAt: new Date() },
      { id: '5', author: 'u5', content: '와', createdAt: new Date() },
    ];

    const result = filterTier1Messages(raw);
    assert.strictEqual(result.cleanMessages.length, 1);
    assert.strictEqual(result.cleanMessages[0].id, '4');
    assert.strictEqual(result.cleanMessages[0].content, '배포 일정 공유합니다.');
  });
});
