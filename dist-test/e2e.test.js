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
(0, node_test_1.describe)('E2E Full Pipeline: Discord Messages ➔ Backend AI Core ➔ DB ➔ Query', () => {
    (0, node_test_1.it)('extracts multi-decisions via POST /api/discussions/analyze and queries them', async () => {
        // 1. Start Backend Server with Mock AI Engine
        const repo = new db_js_1.DecisionRepository(':memory:');
        const extractor = new engine_js_1.BackendExtractionEngine();
        const server = (0, server_js_1.createServer)(repo, extractor);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        // 2. Simulate raw Discord discussion messages
        const rawMessages = [
            {
                author: 'wooddang',
                content: '메인 데이터베이스랑 백엔드 프레임워크 결정합시다.',
                createdAt: '2026-09-28T14:30:00Z'
            },
            {
                author: 'alex',
                content: '트랜잭션 때문에 DB는 PostgreSQL로 가고, 서버 프레임워크는 Fastify로 가시죠.',
                createdAt: '2026-09-28T14:31:00Z',
                replyingTo: 'wooddang'
            },
            {
                author: 'wooddang',
                content: '좋습니다! PostgreSQL + Fastify 조합으로 확정하겠습니다.',
                createdAt: '2026-09-28T14:32:00Z'
            }
        ];
        // 3. Call Backend AI Analysis Endpoint
        const analyzeRes = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawMessages,
                guildId: 'guild-demo',
                channelId: 'chan-arch',
                channelName: 'dev-architecture',
                triggerMessageId: 'msg-103',
                messageUrl: 'https://discord.com/channels/guild-demo/chan-arch/msg-103'
            })
        });
        node_assert_1.default.strictEqual(analyzeRes.status, 200);
        const analyzeData = await analyzeRes.json();
        node_assert_1.default.strictEqual(analyzeData.found, true);
        node_assert_1.default.strictEqual(analyzeData.decisions.length, 2); // Multi-decision extraction (Postgres + Fastify)
        const postgresDec = analyzeData.decisions.find((d) => d.topic === 'Database Selection');
        const fastifyDec = analyzeData.decisions.find((d) => d.topic === 'Backend Framework');
        node_assert_1.default.ok(postgresDec);
        node_assert_1.default.ok(fastifyDec);
        node_assert_1.default.ok(postgresDec.rawTranscript.includes('PostgreSQL'));
        node_assert_1.default.strictEqual(postgresDec.source.rawMessages.length, 3);
        // 4. Query Decisions via GET /api/decisions
        const queryRes = await fetch(`http://localhost:${port}/api/decisions`);
        node_assert_1.default.strictEqual(queryRes.status, 200);
        const queryData = await queryRes.json();
        node_assert_1.default.strictEqual(queryData.decisions.length, 2);
        // 5. Test Conflict Resolution: Supersede
        const resolveRes = await fetch(`http://localhost:${port}/api/decisions/resolve-conflict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decisionId: fastifyDec.id,
                conflictingId: postgresDec.id,
                resolution: 'supersede'
            })
        });
        node_assert_1.default.strictEqual(resolveRes.status, 200);
        const updatedPostgres = repo.getDecisionById(postgresDec.id);
        node_assert_1.default.strictEqual(updatedPostgres?.state, 'Superseded');
        server.close();
        repo.close();
    });
    (0, node_test_1.it)('handles casual chatter with no decisions', async () => {
        const repo = new db_js_1.DecisionRepository(':memory:');
        const server = (0, server_js_1.createServer)(repo, new engine_js_1.BackendExtractionEngine());
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        const res = await fetch(`http://localhost:${port}/api/discussions/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rawMessages: [
                    { author: 'wooddang', content: '오늘 점심 뭐 먹을까요?', createdAt: '2026-09-28T12:00:00Z' }
                ]
            })
        });
        node_assert_1.default.strictEqual(res.status, 200);
        const data = await res.json();
        node_assert_1.default.strictEqual(data.found, false);
        node_assert_1.default.strictEqual(data.decisions.length, 0);
        server.close();
        repo.close();
    });
});
