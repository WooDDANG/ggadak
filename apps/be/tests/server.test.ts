import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import http from 'node:http';
import { createServer } from '../src/server.js';
import { DecisionRepository } from '../src/repositories/decision.repository.js';
import { isolatedRepository } from '../src/repositories/test-database.js';

describe('BE Server & Ingestion API', () => {
  let server: http.Server;
  let repo: DecisionRepository;
  let port: number;
  let database: Awaited<ReturnType<typeof isolatedRepository>>;

  beforeAll(async () => {
    database = await isolatedRepository();
    repo = database.repo;
    server = await createServer(repo);
    await new Promise<void>(resolve => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => {
      server.close(() => {
        resolve();
      });
    });
    await database.cleanup();
  });

  it('retires legacy decision webhook, conflict, listing, and review routes', async () => {
    const base = `http://localhost:${port}/api`;
    const routes = [
      ['POST', '/webhooks/decisions'],
      ['POST', '/decisions/conflict'],
      ['POST', '/decisions/resolve-conflict'],
      ['GET', '/decisions'],
      ['POST', '/decisions/any-id/review'],
    ] as const;
    for (const [method, path] of routes) {
      const response = await fetch(`${base}${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('requires authentication to read v1 Decision Records', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/decisions?topic=Architecture`);
    expect(response.status).toBe(401);
    expect(((await response.json()) as any).code).toBe('UNAUTHORIZED');
  });

  it('returns a v1 error envelope for unknown routes while preserving legacy errors', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      success: false,
      code: 'NOT_FOUND',
      message: 'Not Found',
      data: null,
    });
    const legacy = await fetch(`http://localhost:${port}/api/missing`);
    expect(await legacy.json()).toStrictEqual({ error: 'Not Found' });
  });

  it('uses the v1 validation envelope for malformed JSON', async () => {
    const response = await fetch(`http://localhost:${port}/api/v1/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.data).toBe(null);
    expect(typeof body.message).toBe('string');
  });

  it('manages channel checkpoints via GET and POST /api/channels/:channelId/checkpoint', async () => {
    // 1. Initial GET should return null for lastMessageId
    const res1 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`);
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as any;
    expect(data1.channelId).toBe('test-chan-1');
    expect(data1.lastMessageId).toBe(null);

    // 2. POST to save checkpoint
    const res2 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastMessageId: 'msg-999' }),
    });
    expect(res2.status).toBe(200);

    // 3. GET should return updated lastMessageId
    const res3 = await fetch(`http://localhost:${port}/api/channels/test-chan-1/checkpoint`);
    expect(res3.status).toBe(200);
    const data3 = (await res3.json()) as any;
    expect(data3.lastMessageId).toBe('msg-999');
  });

  it('exposes centralized harvesting policy via GET /api/config/policy', async () => {
    const res = await fetch(`http://localhost:${port}/api/config/policy`);
    expect(res.status).toBe(200);
    const policy = (await res.json()) as any;
    expect(policy.initialScanLimit).toBe(50);
    expect(policy.contextWindowBefore).toBe(15);
    expect(policy.contextWindowAfter).toBe(5);
    expect(policy.reactionThreshold).toBe(3);
  });

  it('manages external feedback via POST and GET /api/feedbacks', async () => {
    const feedbackPayload = {
      id: 'FB-001',
      source: '교수',
      detail: '캡스톤 중간발표',
      content: '대학생 전체보다 동아리 프로젝트 팀으로 타깃을 좁혀보세요.',
      channelId: 'chan-feedback-1',
      createdAt: new Date().toISOString(),
    };

    const postRes = await fetch(`http://localhost:${port}/api/feedbacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackPayload),
    });
    expect(postRes.status).toBe(201);

    const getRes = await fetch(`http://localhost:${port}/api/feedbacks?channelId=chan-feedback-1`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as any;
    expect(getData.feedbacks.length).toBe(1);
    expect(getData.feedbacks[0].content).toBe(feedbackPayload.content);
    expect(getData.feedbacks[0].source).toBe('교수');
  });
  it('returns the common v1 envelope when the request limit is exceeded', async () => {
    const previous = process.env.DISABLE_RATE_LIMIT;
    process.env.DISABLE_RATE_LIMIT = 'false';
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      let response: Response;
      for (let index = 0; index < 121; index++) {
        response = await fetch(`http://localhost:${port}/api/v1/decisions`);
        if (response.status === 429) break;
        await response.text();
      }
      expect(response!.status).toBe(429);
      const body = (await response!.json()) as any;
      expect(body.success).toBe(false);
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.data).toBe(null);
    } finally {
      if (previous === undefined) delete process.env.DISABLE_RATE_LIMIT;
      else process.env.DISABLE_RATE_LIMIT = previous;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
    }
  });
});
