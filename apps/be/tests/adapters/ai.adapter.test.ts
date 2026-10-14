import 'reflect-metadata';
import { test, expect } from 'vitest';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';
const context = (adapter: AiAdapter) => ({
  signal: new AbortController().signal,
  settings: adapter.settings,
});
const graph = { summary: 'Context only', nodes: [], edges: [], discussionProblems: [] };

test('selected provider fails closed on missing key and production mock', async () => {
  const adapter = new AiAdapter({ provider: 'gemini', openaiApiKey: 'unused' }, 'production');
  await expect(adapter.extractGraph('대화', context(adapter))).rejects.toMatchObject({
    statusCode: 422,
  });
  for (const provider of ['mock', 'other']) {
    const instance = new AiAdapter({ provider }, 'production');
    await expect(instance.extractGraph('대화', context(instance))).rejects.toMatchObject({
      statusCode: 422,
    });
  }
});

test('Gemini receives graph schema, output limit and only supplied input; usage survives', async () => {
  const adapter = new AiAdapter(
    { provider: 'gemini', model: 'configured', geminiApiKey: 'fixture' },
    'production',
    async (url, options) => {
      expect(String(url)).toContain('/configured:generateContent');
      const body = JSON.parse(options!.body as string);
      expect(body.generationConfig.responseJsonSchema.type).toBe('object');
      expect(body.generationConfig.responseJsonSchema.properties.nodes).toBeDefined();
      expect(body.generationConfig.maxOutputTokens).toBe(8192);
      expect(body.contents[0].parts[0].text).toBe(JSON.stringify({ transcript: '논의중' }));
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(graph) }] } },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
      });
    },
  );
  expect(await adapter.extractGraph('논의중', context(adapter))).toEqual({
    value: graph,
    usage: { inputTokens: 12, outputTokens: 5 },
  });
});

test('OpenAI uses instance transport with strict schema and no hidden SDK retries', async () => {
  let requests = 0;
  const adapter = new AiAdapter(
    { provider: 'openai', openaiApiKey: 'fixture' },
    'production',
    async (url, options) => {
      requests++;
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(options!.body as string);
      expect(body.response_format.json_schema.strict).toBe(true);
      const schema = body.response_format.json_schema.schema;
      expect(schema.required).toEqual(Object.keys(schema.properties));
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ valid: true, issues: [] }) },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      });
    },
  );
  expect((await adapter.verifyGraph('input', graph, context(adapter))).value).toEqual({
    valid: true,
    issues: [],
  });
  expect(requests).toBe(1);
});

test('provider rejection, refusal, truncation, malformed JSON and outages remain distinguishable failures', async () => {
  for (const [response, statusCode] of [
    [new Response('', { status: 404 }), 422],
    [new Response('', { status: 429 }), 503],
    [new Response('', { status: 503 }), 503],
    [
      Response.json({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }],
      }),
      422,
    ],
    [
      Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{bad' }] } }],
      }),
      422,
    ],
  ] as const) {
    const adapter = new AiAdapter(
      { provider: 'gemini', geminiApiKey: 'fixture' },
      'production',
      async () => response,
    );
    await expect(adapter.extractGraph('input', context(adapter))).rejects.toMatchObject({
      statusCode,
    });
  }
});

test('input budget rejects rather than truncating; development fixture does not invent candidates', async () => {
  const fixture = new AiAdapter({ provider: 'mock' }, 'test');
  expect((await fixture.extractGraph('SQLite로 가자', context(fixture))).value).toMatchObject({
    nodes: [],
    edges: [],
  });
  const adapter = new AiAdapter(
    { provider: 'openai', openaiApiKey: 'fixture' },
    'production',
    async () => {
      throw new Error('should not call');
    },
  );
  await expect(
    adapter.extractGraph('too long', {
      ...context(adapter),
      settings: { ...adapter.settings, maxInputChars: 1 },
    }),
  ).rejects.toMatchObject({ statusCode: 422 });
});
