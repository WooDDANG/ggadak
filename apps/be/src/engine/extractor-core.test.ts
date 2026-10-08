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

  it('slices long session (>15 msgs) when significant topic drift occurs via TextTiling', () => {
    const baseTime = new Date('2026-10-01T10:00:00Z').getTime();

    // 18 messages without idle gaps (1 minute intervals):
    // First 9 messages: Discussing Database & SQL
    // Next 9 messages: Discussing Pizza & Dinner Menu (abrupt drift)
    const messages = [
      // DB Topic (msgs 1-9)
      { id: 'm1', author: 'u1', content: '데이터베이스 엔진 검토를 시작합시다', createdAt: new Date(baseTime + 1 * 60000).toISOString() },
      { id: 'm2', author: 'u2', content: 'PostgreSQL이 우리 요구사항에 가장 부합합니다', createdAt: new Date(baseTime + 2 * 60000).toISOString() },
      { id: 'm3', author: 'u1', content: '트랜잭션 ACID 지원과 SQL 표준 준수가 필수적이죠', createdAt: new Date(baseTime + 3 * 60000).toISOString() },
      { id: 'm4', author: 'u3', content: 'Prisma ORM과 연동도 매끄럽게 처리됩니다', createdAt: new Date(baseTime + 4 * 60000).toISOString() },
      { id: 'm5', author: 'u2', content: '마이그레이션 도구도 안정적이라 위험이 적습니다', createdAt: new Date(baseTime + 5 * 60000).toISOString() },
      { id: 'm6', author: 'u1', content: '그럼 DB는 PostgreSQL 단독 채택으로 가닥을 잡죠', createdAt: new Date(baseTime + 6 * 60000).toISOString() },
      { id: 'm7', author: 'u3', content: '동의합니다 PostgreSQL 도입으로 픽스합시다', createdAt: new Date(baseTime + 7 * 60000).toISOString() },
      { id: 'm8', author: 'u2', content: 'DB 설정 확인 완료했습니다', createdAt: new Date(baseTime + 8 * 60000).toISOString() },
      { id: 'm9', author: 'u1', content: 'DB 인프라 도커 컴포즈에 추가해둘게요', createdAt: new Date(baseTime + 9 * 60000).toISOString() },
      // Topic Drift: Dinner & Pizza (msgs 10-18)
      { id: 'm10', author: 'u4', content: '오늘 저녁 회식 메뉴는 뭘로 먹을까요?', createdAt: new Date(baseTime + 10 * 60000).toISOString() },
      { id: 'm11', author: 'u5', content: '도미노 피자 신메뉴 새로 나왔던데 피자 어때요', createdAt: new Date(baseTime + 11 * 60000).toISOString() },
      { id: 'm12', author: 'u4', content: '페퍼로니 피자랑 치즈 오븐 스파게티 세트 좋네요', createdAt: new Date(baseTime + 12 * 60000).toISOString() },
      { id: 'm13', author: 'u5', content: '콜라도 제로 콜라 큰걸로 두 개 시킵시다', createdAt: new Date(baseTime + 13 * 60000).toISOString() },
      { id: 'm14', author: 'u4', content: '배달 앱으로 쿠폰 써서 주문 완료했습니다', createdAt: new Date(baseTime + 14 * 60000).toISOString() },
      { id: 'm15', author: 'u5', content: '도착하면 탕비실로 모여서 같이 먹어요', createdAt: new Date(baseTime + 15 * 60000).toISOString() },
      { id: 'm16', author: 'u4', content: '테이블 세팅 미리 해둘게요 포크랑 접시 챙겨와요', createdAt: new Date(baseTime + 16 * 60000).toISOString() },
      { id: 'm17', author: 'u5', content: '맛있게 잘 먹었습니다 다들 수고하셨어요', createdAt: new Date(baseTime + 17 * 60000).toISOString() },
      { id: 'm18', author: 'u4', content: '분리수거 쓰레기통 정리하고 퇴근합시다', createdAt: new Date(baseTime + 18 * 60000).toISOString() },
    ];

    const chunks = core.sliceSessionWithTopicDrift(messages, 30, 0.35);
    assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);
    // Verify first chunk has DB topic and later chunk has pizza topic
    assert.strictEqual(chunks[0][0].id, 'm1');
    const lastChunk = chunks[chunks.length - 1];
    assert.strictEqual(lastChunk[lastChunk.length - 1].id, 'm18');
  });

  it('keeps short sessions (<= 15 msgs) intact without artificial topic drift splitting', () => {
    const baseTime = new Date('2026-10-01T10:00:00Z').getTime();
    const shortMessages = [
      { id: 's1', author: 'u1', content: '회의 시작합시다', createdAt: new Date(baseTime).toISOString() },
      { id: 's2', author: 'u2', content: '넵 안건은 배포 일정입니다', createdAt: new Date(baseTime + 60000).toISOString() },
      { id: 's3', author: 'u1', content: '내일 배포로 확정하죠', createdAt: new Date(baseTime + 120000).toISOString() },
    ];

    const chunks = core.sliceSessionWithTopicDrift(shortMessages, 30, 0.35);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].length, 3);
  });
});
