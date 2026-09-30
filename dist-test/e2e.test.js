"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const server_js_1 = require("../apps/be/dist/server.js");
const db_js_1 = require("../apps/be/dist/db.js");
const engine_js_1 = require("../apps/be/dist/extractor/engine.js");
(0, node_test_1.describe)('E2E Full Pipeline: Discord Messages ➔ Backend AI Core ➔ Review Queue ➔ DB ➔ Query', () => {
    (0, node_test_1.it)('extracts multi-decision candidates in DRAFT state and confirms via Review Queue', async () => {
        // 1. Start Backend Server with Mock AI Engine
        const repo = new db_js_1.DecisionRepository();
        const extractor = new engine_js_1.BackendExtractionEngine();
        const server = (0, server_js_1.createServer)(repo, extractor);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        // 2. Centralized Policy verification
        const policyRes = await fetch(`http://localhost:${port}/api/config/policy`);
        node_assert_1.default.strictEqual(policyRes.status, 200);
        const policy = (await policyRes.json());
        node_assert_1.default.strictEqual(policy.reactionThreshold, 3);
        node_assert_1.default.strictEqual(policy.maxMergedWindow, 40);
        // 3. Simulate raw Discord discussion messages
        const rawMessages = [
            {
                id: 'msg-101',
                author: 'wooddang',
                content: '메인 데이터베이스랑 백엔드 프레임워크 결정합시다.',
                createdAt: '2026-09-28T14:30:00Z',
            },
            {
                id: 'msg-102',
                author: 'alex',
                content: '트랜잭션 때문에 DB는 PostgreSQL로 가고, 서버 프레임워크는 Fastify로 가시죠.',
                createdAt: '2026-09-28T14:31:00Z',
                replyingTo: 'wooddang',
            },
            {
                id: 'msg-103',
                author: 'wooddang',
                content: '좋습니다! PostgreSQL + Fastify 조합으로 확정하겠습니다.',
                createdAt: '2026-09-28T14:32:00Z',
            },
        ];
        // 4. Call Backend AI Analysis Endpoint
        const analyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawMessages,
                guildId: 'guild-demo',
                channelId: 'chan-arch',
                channelName: 'dev-architecture',
                triggerMessageId: 'msg-103',
                messageUrl: 'https://discord.com/channels/guild-demo/chan-arch/msg-103',
            }),
        });
        node_assert_1.default.strictEqual(analyzeRes.status, 200);
        const analyzeData = (await analyzeRes.json());
        node_assert_1.default.strictEqual(analyzeData.found, true);
        node_assert_1.default.strictEqual(analyzeData.decisions.length, 2); // Multi-decision extraction
        const postgresDec = analyzeData.decisions.find((d) => d.topic === 'Database Selection');
        const fastifyDec = analyzeData.decisions.find((d) => d.topic === 'Backend Framework');
        node_assert_1.default.ok(postgresDec);
        node_assert_1.default.ok(fastifyDec);
        node_assert_1.default.strictEqual(postgresDec.state, 'Draft'); // Initial state is Draft (PM policy)
        node_assert_1.default.strictEqual(postgresDec.categoryTag, '기술');
        node_assert_1.default.ok(postgresDec.alternatives.length > 0);
        node_assert_1.default.ok(postgresDec.rawTranscript.includes('PostgreSQL'));
        node_assert_1.default.strictEqual(postgresDec.source.rawMessages.length, 3);
        // 5. Human Review Action: Confirm Postgres Decision
        const reviewRes = await fetch(`http://localhost:${port}/api/decisions/${postgresDec.id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'confirm',
                approvedBy: 'reviewer_wooddang',
            }),
        });
        node_assert_1.default.strictEqual(reviewRes.status, 200);
        const reviewData = (await reviewRes.json());
        node_assert_1.default.strictEqual(reviewData.decision.state, 'Decided');
        node_assert_1.default.strictEqual(reviewData.decision.approvedBy, 'reviewer_wooddang');
        // 6. Query Decisions via GET /api/decisions
        const queryRes = await fetch(`http://localhost:${port}/api/decisions?state=Decided`);
        node_assert_1.default.strictEqual(queryRes.status, 200);
        const queryData = (await queryRes.json());
        node_assert_1.default.strictEqual(queryData.decisions.length, 1);
        node_assert_1.default.strictEqual(queryData.decisions[0].id, postgresDec.id);
        // 7. Test Anti-recreation on Rejection
        const rejectRes = await fetch(`http://localhost:${port}/api/decisions/${fastifyDec.id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reject' }),
        });
        node_assert_1.default.strictEqual(rejectRes.status, 200);
        // Re-analyzing the same messages should be skipped by anti-recreation hash
        const reAnalyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawMessages,
                guildId: 'guild-demo',
                channelId: 'chan-arch',
                triggerMessageId: 'msg-103',
            }),
        });
        const reAnalyzeData = (await reAnalyzeRes.json());
        node_assert_1.default.strictEqual(reAnalyzeData.found, false);
        server.close();
        repo.close();
    });
    (0, node_test_1.it)('handles casual chatter with no decisions', async () => {
        const repo = new db_js_1.DecisionRepository();
        const server = (0, server_js_1.createServer)(repo, new engine_js_1.BackendExtractionEngine());
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        const res = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawMessages: [
                    {
                        author: 'wooddang',
                        content: '오늘 점심 뭐 먹을까요?',
                        createdAt: '2026-09-28T12:00:00Z',
                    },
                ],
            }),
        });
        node_assert_1.default.strictEqual(res.status, 200);
        const data = (await res.json());
        node_assert_1.default.strictEqual(data.found, false);
        node_assert_1.default.strictEqual(data.decisions.length, 0);
        server.close();
        repo.close();
    });
});
