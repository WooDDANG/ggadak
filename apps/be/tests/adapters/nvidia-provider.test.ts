import { test, expect } from 'vitest';
import {
  NvidiaProvider,
  extractAndParseJson,
  nvidiaRetryAfterMs,
} from '../../src/adapters/nvidia-provider.js';
import { GraphSchema, VerificationSchema } from '../../src/domain/decision-graph.js';

test('Retry-After의 초와 HTTP 날짜를 해석하고 잘못된 헤더는 기본 대기를 적용한다', () => {
  const now = Date.parse('2026-11-18T00:00:00Z');
  expect(nvidiaRetryAfterMs({ headers: { 'retry-after': '2.5' } }, now)).toBe(2500);
  expect(
    nvidiaRetryAfterMs(
      { headers: new Headers({ 'retry-after': 'Wed, 18 Nov 2026 00:00:10 GMT' }) },
      now,
    ),
  ).toBe(10000);
  expect(nvidiaRetryAfterMs({ headers: { 'retry-after': 'invalid' } }, now)).toBe(60000);
});

test('extractAndParseJson parses direct json, markdown code block, and inner objects', () => {
  expect(extractAndParseJson('{"summary":"Direct"}')).toEqual({ summary: 'Direct' });
  expect(extractAndParseJson('```json\n{"summary":"Inside Codeblock"}\n```')).toEqual({
    summary: 'Inside Codeblock',
  });
  expect(
    extractAndParseJson(
      'Here is the result:\n```\n{"summary":"No tag codeblock"}\n```\nHope it helps!',
    ),
  ).toEqual({ summary: 'No tag codeblock' });
  expect(
    extractAndParseJson('Some thinking prelude... {"summary":"Found in braces"} trailing text'),
  ).toEqual({ summary: 'Found in braces' });
  expect(() => extractAndParseJson('not a json at all')).toThrow();
});

test('NvidiaProvider streams chunks, aggregates reasoning/content, and returns parsed JSON', async () => {
  const graph = { summary: 'Nemotron Decision', nodes: [], edges: [], discussionProblems: [] };
  let capturedBody: any;
  let capturedOptions: any;

  const mockClient: any = {
    chat: {
      completions: {
        create: async (body: any, options: any) => {
          capturedBody = body;
          capturedOptions = options;
          async function* generator() {
            yield {
              choices: [{ delta: { reasoning_content: 'Let me think about PostgreSQL...' } }],
            };
            yield {
              choices: [{ delta: { content: '```json\n' } }],
            };
            yield {
              choices: [{ delta: { content: JSON.stringify(graph) } }],
            };
            yield {
              choices: [{ delta: { content: '\n```' } }],
              usage: { prompt_tokens: 42, completion_tokens: 15 },
            };
          }
          return generator();
        },
      },
    },
  };

  const provider = new NvidiaProvider({ client: mockClient });
  const signal = new AbortController().signal;

  const result = await provider.generate({
    model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    system: 'Extract decisions',
    input: JSON.stringify({ transcript: 'PostgreSQL 사용 확정' }),
    outputSchema: GraphSchema,
    maxOutputTokens: 1000,
    signal,
  });

  expect(result).toMatchObject({
    value: graph,
    usage: { inputTokens: 42, outputTokens: 15 },
  });
  expect(result.ttftMs).toBeGreaterThanOrEqual(0);
  expect(capturedBody.model).toBe('nvidia/nemotron-3.5-super-vl-120b-a12b');
  expect(capturedBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(capturedBody.stream).toBe(true);
  expect(capturedBody.temperature).toBe(0.2);
  expect(capturedBody.response_format).toEqual({ type: 'json_object' });
  expect(capturedOptions.signal).toBe(signal);
});

test('Verify 요청은 필수 필드 JSON Schema를 전달한다', async () => {
  let body: any;
  const client: any = {
    chat: {
      completions: {
        create: async (request: any) => {
          body = request;
          async function* chunks() {
            yield { choices: [{ delta: { content: '{"valid":true,"issues":[]}' } }] };
          }
          return chunks();
        },
      },
    },
  };
  const result = await new NvidiaProvider({ client }).generate({
    model: 'model',
    system: 'verify',
    input: '{}',
    outputSchema: VerificationSchema,
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  });
  expect(result.value).toEqual({ valid: true, issues: [] });
  expect(body.response_format.type).toBe('json_schema');
  expect(body.response_format.json_schema.schema.required).toEqual(
    expect.arrayContaining(['valid', 'issues']),
  );
  expect(
    VerificationSchema.safeParse({
      valid: true,
      issues: [{ message: 'x', nodeIds: [], edgeIds: [] }],
    }).success,
  ).toBe(false);
});

test('Verify JSON Schema를 끄면 JSON 객체 모드로 요청한다', async () => {
  const previous = process.env.NVIDIA_VERIFY_JSON_SCHEMA;
  process.env.NVIDIA_VERIFY_JSON_SCHEMA = 'false';
  let body: any;
  const client: any = {
    chat: {
      completions: {
        create: async (request: any) => {
          body = request;
          async function* chunks() {
            yield { choices: [{ delta: { content: '{"valid":true,"issues":[]}' } }] };
          }
          return chunks();
        },
      },
    },
  };
  try {
    await new NvidiaProvider({ client }).generate({
      model: 'model',
      system: 'verify',
      input: '{}',
      outputSchema: VerificationSchema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    });
    expect(body.response_format).toEqual({ type: 'json_object' });
  } finally {
    if (previous === undefined) delete process.env.NVIDIA_VERIFY_JSON_SCHEMA;
    else process.env.NVIDIA_VERIFY_JSON_SCHEMA = previous;
  }
});

test('JSON Schema를 지원하지 않는 엔드포인트 오류는 숨은 재시도 없이 전달한다', async () => {
  let calls = 0;
  const client: any = {
    chat: {
      completions: {
        create: async () => {
          calls++;
          throw Object.assign(new Error('Unsupported response_format'), { status: 400 });
        },
      },
    },
  };
  await expect(
    new NvidiaProvider({ client }).generate({
      model: 'model',
      system: 'verify',
      input: '{}',
      outputSchema: VerificationSchema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(calls).toBe(1);
});

test('NvidiaProvider enforces max output tokens and handles empty responses', async () => {
  const emptyMockClient: any = {
    chat: {
      completions: {
        create: async () => {
          async function* generator() {
            yield { choices: [{ delta: {} }] };
          }
          return generator();
        },
      },
    },
  };

  const providerEmpty = new NvidiaProvider({ client: emptyMockClient });
  await expect(
    providerEmpty.generate({
      model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      system: 'system',
      input: '{}',
      outputSchema: GraphSchema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({
    statusCode: 422,
    message: 'AI returned no content',
  });

  const overLimitMockClient: any = {
    chat: {
      completions: {
        create: async () => {
          async function* generator() {
            yield {
              choices: [{ delta: { content: '{"nodes":[]}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 200 },
            };
          }
          return generator();
        },
      },
    },
  };

  const providerOverLimit = new NvidiaProvider({ client: overLimitMockClient });
  await expect(
    providerOverLimit.generate({
      model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      system: 'system',
      input: '{}',
      outputSchema: GraphSchema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({
    statusCode: 422,
    message: 'NVIDIA AI output exceeds application token limit',
  });
});

test('NvidiaProvider does not log reasoning content, respects thinking toggle, and maps timeout to 503', async () => {
  let capturedBody: any;
  const mockClient: any = {
    chat: {
      completions: {
        create: async (body: any) => {
          capturedBody = body;
          async function* generator() {
            yield { choices: [{ delta: { reasoning_content: 'Step 1: parse DB decision' } }] };
            yield { choices: [{ delta: { content: '{"nodes":[]}' } }] };
          }
          return generator();
        },
      },
    },
  };

  const providerThinkingDisabled = new NvidiaProvider({
    client: mockClient,
    enableThinking: false,
    jsonMode: false,
  });

  await providerThinkingDisabled.generate({
    model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    system: 'system',
    input: '{}',
    outputSchema: GraphSchema,
    maxOutputTokens: 1000,
    signal: new AbortController().signal,
  });

  expect(capturedBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(capturedBody).not.toHaveProperty('response_format');

  // Test timeout abort error classification
  const abortController = new AbortController();
  abortController.abort();

  const mockTimeoutClient: any = {
    chat: {
      completions: {
        create: async () => {
          const err = new Error('Request aborted');
          err.name = 'AbortError';
          throw err;
        },
      },
    },
  };

  const providerTimeout = new NvidiaProvider({ client: mockTimeoutClient });
  await expect(
    providerTimeout.generate({
      model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      system: 'system',
      input: '{}',
      outputSchema: GraphSchema,
      maxOutputTokens: 1000,
      signal: abortController.signal,
    }),
  ).rejects.toMatchObject({
    statusCode: 503,
    message: 'AI call timed out after configured deadline',
  });
});
