import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackendApiService } from './backend-api.service.js';

test('Bot feedback registration succeeds against a service-authenticated backend', async () => {
  const feedback = {
    id: 'FB-bot-service-auth',
    source: '교수',
    content: 'Authenticated feedback from the Discord command',
    channelId: 'feedback-channel',
    createdAt: '2026-11-03T00:00:00.000Z',
  };
  let received: unknown;
  const backend: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'http://fixture/api/feedbacks');
    assert.equal(options?.method, 'POST');
    const headers = new Headers(options?.headers);
    if (headers.get('Authorization') !== 'Bearer bot-feedback-service')
      return new Response('', { status: 401 });
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.ok(options?.signal, 'service request must have a bounded timeout');
    received = JSON.parse(String(options?.body));
    return Response.json({ status: 'ok', id: feedback.id }, { status: 201 });
  };
  const api = new BackendApiService(
    'http://fixture',
    '/unused',
    backend,
    undefined,
    'bot-feedback-service',
  );
  assert.equal(await api.saveFeedback(feedback), true);
  assert.deepEqual(received, feedback);
});
