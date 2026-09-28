import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../apps/be/dist/server.js';
import { DecisionRepository } from '../apps/be/dist/db.js';
import { DiscussionContextBuilder } from '../apps/bot/dist/context/builder.js';
import { DecisionExtractor } from '../apps/bot/dist/extractor/engine.js';
import { ConflictDetector } from '../apps/bot/dist/conflict/detector.js';
import { EgressQueue } from '../apps/bot/dist/egress/queue.js';
import { DecisionPayload } from '@ggaddak/shared';

describe('E2E Full Pipeline: Discord Event ➔ LLM ➔ Egress ➔ BE ➔ Query', () => {
  it('runs complete end-to-end decision extraction and delivery with embedded transcript', async () => {
    // 1. Start Backend Server
    const repo = new DecisionRepository(':memory:');
    const beServer = createServer(repo);
    await new Promise<void>(resolve => beServer.listen(0, resolve));
    const bePort = (beServer.address() as any).port;
    const webhookUrl = `http://localhost:${bePort}/api/webhooks/decisions`;

    // 2. Simulate Discord Context Ingestion
    const discordMessages = [
      {
        id: 'msg-101',
        authorId: 'u1',
        authorName: 'wooddang',
        content: '인증 시스템으로 어떤 솔루션을 쓸까요?',
        createdAt: new Date('2026-09-28T14:30:00Z')
      },
      {
        id: 'msg-102',
        authorId: 'u2',
        authorName: 'alex',
        content: '확장성과 보안을 고려해서 NextAuth(Auth.js) 대신 Supabase Auth로 결정합시다.',
        createdAt: new Date('2026-09-28T14:31:00Z'),
        referenceAuthorName: 'wooddang'
      }
    ];

    const transcript = DiscussionContextBuilder.buildTranscript(discordMessages);
    assert.ok(transcript.includes('Supabase Auth'));

    // 3. LLM Extraction
    const extractor = new DecisionExtractor();
    const extracted = await extractor.extract(transcript);
    assert.ok(extracted);

    // 4. Build Decision Entity with embedded transcript
    const decision = {
      id: 'DEC-E2E-001',
      topic: extracted.topic,
      decision: extracted.decision,
      rationale: extracted.rationale,
      actionItems: extracted.actionItems,
      state: 'Decided' as const,
      supersedesId: null,
      rawTranscript: transcript,
      source: {
        guildId: 'guild-demo',
        channelId: 'chan-demo',
        channelName: 'dev-general',
        triggerMessageId: 'msg-102',
        messageUrl: 'https://discord.com/channels/guild-demo/chan-demo/msg-102',
        participants: ['wooddang', 'alex'],
        rawMessages: discordMessages.map(m => ({
          author: m.authorName,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
          replyingTo: m.referenceAuthorName
        }))
      },
      createdAt: new Date().toISOString()
    };

    // 5. Bot Egress Dispatch
    const queue = new EgressQueue(':memory:');
    const payload: DecisionPayload = {
      event: 'decision.recorded',
      version: '1.0.0',
      payload: decision
    };

    queue.enqueue(payload);
    const dispatchResult = await queue.dispatchPending(webhookUrl);
    assert.strictEqual(dispatchResult.sent, 1);

    // 6. Query Backend API
    const queryRes = await fetch(`http://localhost:${bePort}/api/decisions`);
    assert.strictEqual(queryRes.status, 200);
    const queryData = await queryRes.json() as any;

    assert.strictEqual(queryData.decisions.length, 1);
    const saved = queryData.decisions[0];
    assert.strictEqual(saved.id, 'DEC-E2E-001');
    assert.strictEqual(saved.source.channelName, 'dev-general');
    assert.deepStrictEqual(saved.source.participants, ['wooddang', 'alex']);
    assert.ok(saved.rawTranscript.includes('Supabase Auth'));
    assert.strictEqual(saved.source.rawMessages.length, 2);

    // Cleanup
    beServer.close();
    repo.close();
    queue.close();
  });
});
