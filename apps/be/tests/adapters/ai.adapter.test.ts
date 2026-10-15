import 'reflect-metadata';
import { test, expect } from 'vitest';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';
import { GraphSchema, VerificationSchema } from '../../src/domain/decision-graph.js';
const context = (adapter: AiAdapter) => ({
  signal: new AbortController().signal,
  settings: adapter.settings,
});
const graph = { summary: 'Context only', nodes: [], edges: [], discussionProblems: [] };

test('Gemini accepts long text by counted tokens and counts the complete generation request', async () => {
  let generated = false;
  let counted: any;
  const adapter = new AiAdapter(
    { provider: 'gemini', model: 'gemini-3.8-flash', geminiApiKey: 'fixture' },
    'production',
    async (url, options) => {
      if (options?.method === 'GET')
        return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
      if (String(url).endsWith(':countTokens')) {
        counted = JSON.parse(options!.body as string).generateContentRequest;
        return Response.json({ totalTokens: 20000 });
      }
      generated = true;
      expect(JSON.parse(options!.body as string)).toMatchObject({
        contents: counted.contents,
        system_instruction: counted.system_instruction,
      });
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(graph) }] } },
        ],
      });
    },
  );
  await adapter.extractGraph('가'.repeat(100001), {
    ...context(adapter),
    settings: { ...adapter.settings, maxInputChars: 0 },
  });
  expect(generated).toBe(true);
  expect(counted.generationConfig.responseJsonSchema).toBeDefined();
});

test('Gemini rejects excess token input or output before generation and preserves retryable quota errors', async () => {
  let generated = 0;
  let modelReads = 0;
  let inputTokens = 101;
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture' },
    'production',
    async (url, options) => {
      if (options?.method === 'GET') {
        modelReads++;
        return Response.json({ inputTokenLimit: 100, outputTokenLimit: 8192 });
      }
      if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: inputTokens });
      generated++;
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(graph) }] } },
        ],
      });
    },
  );
  await expect(adapter.extractGraph('input', context(adapter))).rejects.toMatchObject({
    statusCode: 422,
    message: 'AI input token limit exceeded',
  });
  await expect(
    adapter.extractGraph('input', {
      ...context(adapter),
      settings: { ...adapter.settings, maxOutputTokens: 8193 },
    }),
  ).rejects.toMatchObject({ statusCode: 422 });
  expect(generated).toBe(0);
  inputTokens = 100;
  await expect(adapter.extractGraph('input', context(adapter))).resolves.toMatchObject({
    value: graph,
  });
  await expect(
    adapter.extractGraph('input', {
      ...context(adapter),
      settings: { ...adapter.settings, maxInputTokens: 99 },
    }),
  ).rejects.toMatchObject({ statusCode: 422 });
  expect(modelReads).toBe(1);
  expect(generated).toBe(1);
  const limited = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture' },
    'production',
    async () => new Response('', { status: 429 }),
  );
  await expect(limited.extractGraph('input', context(limited))).rejects.toMatchObject({
    statusCode: 503,
  });
});

test('Gemini extraction, repair and verification omit array bounds rejected by the provider', async () => {
  const schemas: unknown[] = [];
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture' },
    'production',
    async (_url, options) => {
      if (options?.method === 'GET')
        return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
      if (String(_url).endsWith(':countTokens')) return Response.json({ totalTokens: 10 });
      const body = JSON.parse(options!.body as string);
      schemas.push(body.generationConfig.responseJsonSchema);
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(graph) }] } },
        ],
      });
    },
  );
  await adapter.extractGraph('input', context(adapter));
  await adapter.repairGraph('input', graph, ['missing candidate'], context(adapter));
  await adapter.verifyGraph('input', graph, context(adapter));
  for (const schema of schemas) expect(JSON.stringify(schema)).not.toContain('"maxItems"');
  expect(schemas).toHaveLength(3);
});

test('server validation retains graph and critic array limits', () => {
  const node = { id: 'issue', type: 'Issue', summary: 'Context' };
  expect(GraphSchema.safeParse({ ...graph, nodes: Array(501).fill(node) }).success).toBe(false);
  expect(GraphSchema.safeParse({ ...graph, nodes: Array(500).fill(node) }).success).toBe(true);
  const issue = { message: 'Invalid relation', nodeIds: [], edgeIds: [] };
  expect(
    VerificationSchema.safeParse({ valid: false, issues: Array(501).fill(issue) }).success,
  ).toBe(false);
});

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
      if (options?.method === 'GET')
        return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
      if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 10 });
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
      expect(schema.properties.issues.maxItems).toBe(500);
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
      async (url, options) => {
        if (options?.method === 'GET')
          return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
        if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 10 });
        return response;
      },
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
