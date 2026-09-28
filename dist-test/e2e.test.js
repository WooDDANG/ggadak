"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const server_js_1 = require("../apps/be/dist/server.js");
const db_js_1 = require("../apps/be/dist/db.js");
const builder_js_1 = require("../apps/bot/dist/context/builder.js");
const engine_js_1 = require("../apps/bot/dist/extractor/engine.js");
const queue_js_1 = require("../apps/bot/dist/egress/queue.js");
(0, node_test_1.describe)('E2E Full Pipeline: Discord Event ➔ LLM ➔ Egress ➔ BE ➔ Query', () => {
    (0, node_test_1.it)('runs complete end-to-end decision extraction and delivery', async () => {
        // 1. Start Backend Server
        const repo = new db_js_1.DecisionRepository(':memory:');
        const beServer = (0, server_js_1.createServer)(repo);
        await new Promise(resolve => beServer.listen(0, resolve));
        const bePort = beServer.address().port;
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
        const transcript = builder_js_1.DiscussionContextBuilder.buildTranscript(discordMessages);
        node_assert_1.default.ok(transcript.includes('Supabase Auth'));
        // 3. LLM Extraction
        const extractor = new engine_js_1.DecisionExtractor();
        const extracted = await extractor.extract(transcript);
        node_assert_1.default.ok(extracted);
        // 4. Build Decision Entity
        const decision = {
            id: 'DEC-E2E-001',
            topic: extracted.topic,
            decision: extracted.decision,
            rationale: extracted.rationale,
            actionItems: extracted.actionItems,
            state: 'Decided',
            supersedesId: null,
            source: {
                guildId: 'guild-demo',
                channelId: 'chan-demo',
                channelName: 'dev-general',
                triggerMessageId: 'msg-102',
                messageUrl: 'https://discord.com/channels/guild-demo/chan-demo/msg-102',
                participants: ['wooddang', 'alex']
            },
            createdAt: new Date().toISOString()
        };
        // 5. Bot Egress Dispatch
        const queue = new queue_js_1.EgressQueue(':memory:');
        const payload = {
            event: 'decision.recorded',
            version: '1.0.0',
            payload: decision
        };
        queue.enqueue(payload);
        const dispatchResult = await queue.dispatchPending(webhookUrl);
        node_assert_1.default.strictEqual(dispatchResult.sent, 1);
        // 6. Query Backend API
        const queryRes = await fetch(`http://localhost:${bePort}/api/decisions`);
        node_assert_1.default.strictEqual(queryRes.status, 200);
        const queryData = await queryRes.json();
        node_assert_1.default.strictEqual(queryData.decisions.length, 1);
        const saved = queryData.decisions[0];
        node_assert_1.default.strictEqual(saved.id, 'DEC-E2E-001');
        node_assert_1.default.strictEqual(saved.source.channelName, 'dev-general');
        node_assert_1.default.deepStrictEqual(saved.source.participants, ['wooddang', 'alex']);
        // Cleanup
        beServer.close();
        repo.close();
        queue.close();
    });
});
