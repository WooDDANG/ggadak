import { test, expect } from 'vitest';
import { NvidiaProvider, extractAndParseJson } from '../../src/adapters/nvidia-provider.js';
import { GraphSchema } from '../../src/domain/decision-graph.js';

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
  expect(capturedOptions.signal).toBe(signal);
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
