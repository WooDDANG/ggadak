import 'reflect-metadata';
import { test, expect } from 'vitest';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';
import type { AiProvider, AiProviderRequest } from '../../src/adapters/ai-provider.js';
import { GraphSchema, VerificationSchema } from '../../src/domain/decision-graph.js';

const graph = { summary: 'Context only', nodes: [], edges: [], discussionProblems: [] };
const context = (adapter: AiAdapter) => ({
  signal: new AbortController().signal,
  settings: adapter.settings,
});

test('AiAdapter chooses the stage model and schema, then delegates a normalized request', async () => {
  const requests: AiProviderRequest[] = [];
  const provider: AiProvider = {
    generate: async request => {
      requests.push(request);
      return { value: request.outputSchema === VerificationSchema ? { valid: true } : graph };
    },
  };
  const adapter = new AiAdapter(
    { provider: 'agy', model: 'base', stageModels: { extract: 'fast', verify: 'critic' } },
    'production',
    provider,
  );
  const callContext = context(adapter);

  await adapter.extractGraph('PostgreSQL로 결정', callContext);
  await adapter.verifyGraph('PostgreSQL로 결정', graph, callContext);
  await adapter.repairGraph('PostgreSQL로 결정', graph, ['missing evidence'], callContext);

  expect(requests.map(request => request.model)).toEqual(['fast', 'critic', 'base']);
  expect(requests[0].input).toBe(JSON.stringify({ transcript: 'PostgreSQL로 결정' }));
  expect(requests[1].outputSchema).toBe(VerificationSchema);
  expect(requests[2].input).toContain('missing evidence');
  expect(
    requests.every(request => request.maxOutputTokens === adapter.settings.maxOutputTokens),
  ).toBe(true);
});

test('AiAdapter rejects unsupported providers and unsupported exact input-token preflight', async () => {
  const provider: AiProvider = { generate: async () => ({ value: graph }) };
  const unsupported = new AiAdapter({ provider: 'gemini' }, 'production', provider);
  await expect(unsupported.extractGraph('input', context(unsupported))).rejects.toMatchObject({
    statusCode: 422,
    message: 'Unsupported AI_PROVIDER; expected agy',
  });

  const agy = new AiAdapter({ provider: 'agy' }, 'production', provider);
  await expect(
    agy.extractGraph('input', {
      ...context(agy),
      settings: { ...agy.settings, maxInputTokens: 100 },
    }),
  ).rejects.toMatchObject({
    statusCode: 422,
    message: expect.stringContaining('does not support'),
  });
});

test('AiAdapter enforces character limits and keeps mock output limited to development and tests', async () => {
  const provider: AiProvider = {
    generate: async () => {
      throw new Error('Provider must not run for invalid input');
    },
  };
  const adapter = new AiAdapter({ provider: 'agy' }, 'production', provider);
  await expect(
    adapter.extractGraph('too long', {
      ...context(adapter),
      settings: { ...adapter.settings, maxInputChars: 1 },
    }),
  ).rejects.toMatchObject({ statusCode: 422, message: 'AI input limit exceeded' });

  const fixture = new AiAdapter({ provider: 'mock' }, 'test', provider);
  expect((await fixture.extractGraph('SQLite로 가자', context(fixture))).value).toMatchObject({
    nodes: [],
    edges: [],
  });
  const productionMock = new AiAdapter({ provider: 'mock' }, 'production', provider);
  await expect(productionMock.extractGraph('대화', context(productionMock))).rejects.toMatchObject({
    statusCode: 422,
  });
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
