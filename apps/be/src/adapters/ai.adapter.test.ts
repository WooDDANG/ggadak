import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiAdapter } from './ai.adapter.js';

test('selected Gemini provider fails closed on missing key even when OpenAI is available', async () => {
  const adapter = new AiAdapter({ provider: 'gemini', openaiApiKey: 'unused' }, 'production');
  await assert.rejects(adapter.analyzeTranscript('SQLite를 채택합시다'), /key/i);
});

test('provider errors and malformed extraction are observable and never become heuristic candidates', async () => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    Response.json({ candidates: [{ content: { parts: [{ text: '{"found":true}' }] } }] }),
  ]) {
    const adapter = new AiAdapter(
      { provider: 'gemini', geminiApiKey: 'fixture' },
      'production',
      async () => response,
    );
    await assert.rejects(adapter.analyzeTranscript('SQLite를 채택합시다'));
  }
});

test('explicit development mock is allowed, while production mock and unknown providers fail', async () => {
  await assert.rejects(
    new AiAdapter({ provider: 'mock' }, 'production').analyzeTranscript('합의합시다'),
    /Mock/,
  );
  await assert.rejects(
    new AiAdapter({ provider: 'other' }, 'test').analyzeTranscript('합의합시다'),
    /Unsupported/,
  );
  assert.equal(
    (await new AiAdapter({ provider: 'mock' }, 'test').analyzeTranscript('SQLite를 채택합시다'))
      .found,
    true,
  );
});

test('fixed Gemini response validates without calling another provider', async () => {
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture', openaiApiKey: 'unused' },
    'production',
    async (_url, options) => {
      assert.equal((options?.headers as Record<string, string>)['x-goog-api-key'], 'fixture');
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                { text: JSON.stringify({ found: false, summary: 'No consensus', decisions: [] }) },
              ],
            },
          },
        ],
      });
    },
  );
  assert.deepEqual(await adapter.analyzeTranscript('논의중'), {
    found: false,
    summary: 'No consensus',
    decisions: [],
  });
});
