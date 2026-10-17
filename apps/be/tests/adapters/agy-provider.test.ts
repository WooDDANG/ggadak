import { test, expect } from 'vitest';
import { AgyProvider } from '../../src/adapters/agy-provider.js';
import { GraphSchema } from '../../src/domain/decision-graph.js';

test('AgyProvider sends a structured request and returns parsed output and usage', async () => {
  const graph = { summary: 'Context', nodes: [], edges: [], discussionProblems: [] };
  let request: any;
  const provider = new AgyProvider({ executable: '/usr/bin/agy' }, async value => {
    request = value;
    return { value: graph, usage: { inputTokens: 15, outputTokens: 4 } };
  });

  await expect(
    provider.generate({
      model: 'gemini-3.8-flash-low',
      system: 'Extract a graph',
      input: JSON.stringify({ transcript: 'Redis로 결정' }),
      outputSchema: GraphSchema,
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ value: graph, usage: { inputTokens: 15, outputTokens: 4 } });
  expect(request).toMatchObject({
    executable: '/usr/bin/agy',
    model: 'gemini-3.8-flash-low',
    prompt: 'Extract a graph\n\nSupplied conversation data:\n{"transcript":"Redis로 결정"}',
  });
  expect(JSON.stringify(request.schema)).not.toContain('maxItems');
});

test('AgyProvider enforces the output usage limit and preserves abort signals', async () => {
  const signal = new AbortController().signal;
  const provider = new AgyProvider({ executable: 'agy' }, async _request => ({
    value: {},
    usage: { inputTokens: 10, outputTokens: 101 },
  }));

  await expect(
    provider.generate({
      model: 'fixture',
      system: 'system',
      input: '{}',
      outputSchema: GraphSchema,
      maxOutputTokens: 100,
      signal,
    }),
  ).rejects.toMatchObject({
    statusCode: 422,
    message: 'AGY output exceeds application token limit',
  });
});
