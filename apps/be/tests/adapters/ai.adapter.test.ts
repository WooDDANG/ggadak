import 'reflect-metadata';
import { test, expect } from 'vitest';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';

test('selected Gemini provider fails closed on missing key even when OpenAI is available', async () => {
  const adapter = new AiAdapter({ provider: 'gemini', openaiApiKey: 'unused' }, 'production');
  await expect(adapter.analyzeTranscript('SQLite를 채택합시다')).rejects.toThrow(/key/i);
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
    await expect(adapter.analyzeTranscript('SQLite를 채택합시다')).rejects.toBeDefined();
  }
});

test('explicit development mock is allowed, while production mock and unknown providers fail', async () => {
  await expect(
    new AiAdapter({ provider: 'mock' }, 'production').analyzeTranscript('합의합시다'),
  ).rejects.toThrow(/Mock/);
  await expect(
    new AiAdapter({ provider: 'other' }, 'test').analyzeTranscript('합의합시다'),
  ).rejects.toThrow(/Unsupported/);
  expect(
    (await new AiAdapter({ provider: 'mock' }, 'test').analyzeTranscript('SQLite를 채택합시다'))
      .found,
  ).toBe(true);
});

test('fixed Gemini response validates without calling another provider', async () => {
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture', openaiApiKey: 'unused' },
    'production',
    async (_url, options) => {
      expect((options?.headers as Record<string, string>)['x-goog-api-key']).toBe('fixture');
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
  expect(await adapter.analyzeTranscript('논의중')).toEqual({
    found: false,
    summary: 'No consensus',
    decisions: [],
  });
});

test('configured model is used and unavailable models are permanent failures while provider outages are retryable', async () => {
  for (const [status, expected] of [
    [404, 422],
    [429, 503],
    [503, 503],
  ]) {
    const adapter = new AiAdapter(
      { provider: 'gemini', model: 'configured-model', geminiApiKey: 'fixture' },
      'production',
      async url => {
        expect(String(url)).toContain('/models/configured-model:generateContent');
        return new Response('', { status });
      },
    );
    await expect(adapter.analyzeTranscript('SQLite를 채택합시다')).rejects.toMatchObject({
      statusCode: expected,
    });
  }
});
