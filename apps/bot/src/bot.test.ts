import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { DiscussionContextBuilder } from './context/builder.js';
import { DecisionExtractor } from './extractor/engine.js';
import { ConflictDetector } from './conflict/detector.js';
import { EgressQueue } from './egress/queue.js';
import { Decision, DecisionPayload } from '@ggaddak/shared';

describe('Bot Core Modules', () => {
  it('DiscussionContextBuilder constructs structured transcripts with replies', () => {
    const messages = [
      {
        id: 'msg-1',
        authorId: 'u1',
        authorName: 'wooddang',
        content: '메인 DB 어떤 걸로 갈까요?',
        createdAt: new Date('2026-09-28T14:00:00Z')
      },
      {
        id: 'msg-2',
        authorId: 'u2',
        authorName: 'alex',
        content: 'Postgres 추천합니다.',
        createdAt: new Date('2026-09-28T14:01:00Z'),
        referenceAuthorName: 'wooddang'
      }
    ];

    const transcript = DiscussionContextBuilder.buildTranscript(messages);
    assert.ok(transcript.includes('[2026-09-28 14:00:00] wooddang: 메인 DB 어떤 걸로 갈까요?'));
    assert.ok(transcript.includes('(replying to wooddang)'));

    const handles = DiscussionContextBuilder.extractParticipantHandles(messages);
    assert.deepStrictEqual(handles, ['wooddang', 'alex']);
  });

  it('DecisionExtractor extracts structured Decision and Rationale', async () => {
    const extractor = new DecisionExtractor();
    const transcript = `
      [2026-09-28 14:00:00] wooddang: 메인 DB 어떤 걸로 갈까요?
      [2026-09-28 14:01:00] alex: 트랜잭션 때문에 PostgreSQL로 갑시다.
    `;

    const extracted = await extractor.extract(transcript);
    assert.ok(extracted);
    assert.strictEqual(extracted.topic, 'Database Selection');
    assert.ok(extracted.decision.includes('PostgreSQL'));
    assert.ok(extracted.rationale.length > 0);
  });

  it('ConflictDetector detects overlapping active decisions', () => {
    const detector = new ConflictDetector();
    const dec1: Decision = {
      id: 'DEC-001',
      topic: 'Database Selection',
      decision: 'Use PostgreSQL',
      rationale: 'ACID transactions',
      alternatives: [],
      categoryTag: '기술',
      actionItems: [],
      state: 'Decided',
      supersedesId: null,
      isPivot: false,
      approvedBy: null,
      decisionConfirmedDate: null,
      feedbackSourceType: null,
      feedbackSourceDetail: null,
      feedbackReceivedDate: null,
      rawEvidence: [],
      source: {
        guildId: 'g1',
        channelId: 'c1',
        triggerMessageId: 'm1',
        participants: [],
        rawMessages: []
      },
      createdAt: new Date().toISOString()
    };

    detector.registerDecision(dec1);

    const conflict = detector.checkConflict('database selection');
    assert.strictEqual(conflict.hasConflict, true);
    assert.strictEqual(conflict.conflictingDecision?.id, 'DEC-001');

    const noConflict = detector.checkConflict('Auth Provider');
    assert.strictEqual(noConflict.hasConflict, false);
  });

  it('EgressQueue enqueues and dispatches DecisionPayload to webhook receiver', async () => {
    let receivedPayload: any = null;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
    });

    await new Promise<void>(resolve => server.listen(0, resolve));
    const addr = server.address() as any;
    const webhookUrl = `http://localhost:${addr.port}/webhook`;

    const queue = new EgressQueue(':memory:');
    const payload: DecisionPayload = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: {
        id: 'DEC-888',
        topic: 'Cache Engine',
        decision: 'Use Redis',
        rationale: 'Sub-millisecond latency for session cache',
        alternatives: [],
        categoryTag: '기술',
        actionItems: [],
        state: 'Decided',
        supersedesId: null,
        isPivot: false,
        approvedBy: null,
        decisionConfirmedDate: null,
        feedbackSourceType: null,
        feedbackSourceDetail: null,
        feedbackReceivedDate: null,
        rawEvidence: [],
        source: {
          guildId: 'g1',
          channelId: 'c1',
          triggerMessageId: 'm1',
          participants: [],
          rawMessages: []
        },
        createdAt: new Date().toISOString()
      }
    };

    queue.enqueue(payload);
    assert.strictEqual(queue.getPendingCount(), 1);

    const result = await queue.dispatchPending(webhookUrl);
    assert.strictEqual(result.sent, 1);
    assert.strictEqual(queue.getPendingCount(), 0);
    assert.strictEqual(receivedPayload.payload.id, 'DEC-888');

    server.close();
    queue.close();
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
});
