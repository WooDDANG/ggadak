import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';

let database: Awaited<ReturnType<typeof isolatedRepository>>;
let server: Server;
let base: string;
const serviceToken = 'feedback-service-fixture';
const feedback = {
  id: 'FB-service-auth',
  source: '교수',
  content: 'Keep feedback inside the authenticated Bot service',
  channelId: 'feedback-channel',
  createdAt: '2026-11-03T00:00:00.000Z',
};

beforeAll(async () => {
  database = await isolatedRepository();
  server = await createServer(database.repo, undefined, {
    ...fakeAuthOptions(),
    serviceToken,
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP test address');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (database) await database.cleanup();
});

test('External Feedback cannot be read or registered without Bot service authentication', async () => {
  const read = await fetch(`${base}/api/feedbacks`);
  expect(read.status).toBe(401);

  const write = await fetch(`${base}/api/feedbacks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...feedback, id: 'FB-anonymous-denied' }),
  });
  expect(write.status).toBe(401);
});

test('incorrect service credentials and a real user JWT cannot read or register global feedback', async () => {
  const { token } = await loginAsTestUser(base);
  for (const credential of ['wrong-service-token', token]) {
    const headers = { Authorization: `Bearer ${credential}` };
    const read = await fetch(`${base}/api/feedbacks`, { headers });
    expect(read.status).toBe(401);
    const write = await fetch(`${base}/api/feedbacks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...feedback, id: 'FB-credential-denied' }),
    });
    expect(write.status).toBe(401);
  }
  const authorizedRead = await fetch(`${base}/api/feedbacks`, {
    headers: { Authorization: `Bearer ${serviceToken}` },
  });
  expect(authorizedRead.status).toBe(200);
  const result = (await authorizedRead.json()) as { feedbacks: Array<{ id: string }> };
  expect(result.feedbacks.some(item => item.id.endsWith('-denied'))).toBe(false);
});

test('a configured Bot service token can register and retrieve External Feedback', async () => {
  const headers = { Authorization: `Bearer ${serviceToken}` };
  const write = await fetch(`${base}/api/feedbacks`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  expect(write.status).toBe(201);
  const read = await fetch(`${base}/api/feedbacks?channelId=feedback-channel`, { headers });
  expect(read.status).toBe(200);
  expect(await read.json()).toEqual({ feedbacks: [feedback] });
});

test('feedback routes fail closed when no Bot service token is configured', async () => {
  const unconfigured = await createServer(database.repo, undefined, {
    ...fakeAuthOptions(),
    serviceToken: '',
  });
  await new Promise<void>(resolve => unconfigured.listen(0, '127.0.0.1', resolve));
  try {
    const address = unconfigured.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test address');
    const url = `http://127.0.0.1:${address.port}/api/feedbacks`;
    const headers = { Authorization: `Bearer ${serviceToken}` };
    expect((await fetch(url, { headers })).status).toBe(401);
    expect(
      (
        await fetch(url, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...feedback, id: 'FB-unconfigured-denied' }),
        })
      ).status,
    ).toBe(401);
  } finally {
    await new Promise<void>(resolve => unconfigured.close(() => resolve()));
  }
});
