import 'reflect-metadata';
import { test, expect, vi } from 'vitest';
import { AiAdapter } from '../../src/adapters/ai.adapter.js';
import type { AiProvider, AiProviderRequest } from '../../src/adapters/ai-provider.js';
import { GraphSchema, VerificationSchema } from '../../src/domain/decision-graph.js';

const graph = { summary: 'Context only', nodes: [], edges: [], discussionProblems: [] };
const context = (adapter: AiAdapter) => ({
  signal: new AbortController().signal,
  settings: adapter.settings,
});

test('graph generation requests specify references and candidate history constraints', async () => {
  const requests: AiProviderRequest[] = [];
  const adapter = new AiAdapter({ provider: 'agy' }, 'production', {
    async generate(request) {
      requests.push(request);
      return { value: graph };
    },
  });
  await adapter.extractGraph('input', context(adapter));
  await adapter.repairGraph('input', graph, ['Invalid endpoints: e1'], context(adapter));
  for (const request of requests) {
    expect(request.system).toContain(
      'Every edge sourceId and targetId must reference existing nodes',
    );
    // 상태 변화 이력은 쓰는 곳이 없어 agentic-5부터 요청하지 않는다.
    expect(request.system).not.toMatch(/history/i);
  }
  const saved = {
    ...context(adapter),
    settings: { ...adapter.settings, promptVersion: 'agentic-4' },
  };
  await adapter.extractGraph('input', saved);
  await adapter.repairGraph('input', graph, ['Invalid endpoints: e1'], saved);
  for (const request of requests.splice(2, 2))
    expect(request.system).toContain(
      'Candidate history observations use proposed/agreed/withdrawn/unclear',
    );
  await adapter.extractGraph('input', {
    ...context(adapter),
    settings: { ...adapter.settings, promptVersion: 'agentic-1' },
  });
  expect(requests[2].system).not.toContain(
    'Every edge sourceId and targetId must reference existing nodes',
  );
  await expect(
    adapter.extractGraph('input', {
      ...context(adapter),
      settings: { ...adapter.settings, promptVersion: 'unknown' },
    }),
  ).rejects.toMatchObject({ statusCode: 422, message: 'Unsupported saved prompt version' });
});

test('a saved analysis cannot run through a different configured provider', async () => {
  let calls = 0;
  const adapter = new AiAdapter({ provider: 'nvidia' }, 'production', {
    async generate() {
      calls++;
      return { value: graph };
    },
  });
  await expect(
    adapter.extractGraph('input', {
      ...context(adapter),
      settings: { ...adapter.settings, provider: 'agy' },
    }),
  ).rejects.toMatchObject({ statusCode: 422 });
  expect(calls).toBe(0);
});

test('새 Verify 프롬프트는 생성 출력 지시를 제외하고 저장된 이전 버전은 유지한다', async () => {
  const requests: AiProviderRequest[] = [];
  const adapter = new AiAdapter({ provider: 'agy' }, 'production', {
    async generate(request) {
      requests.push(request);
      return { value: { valid: true, issues: [] } };
    },
  });
  await adapter.verifyGraph('대화', graph, context(adapter));
  await adapter.verifyGraph('대화', graph, {
    ...context(adapter),
    settings: { ...adapter.settings, promptVersion: 'agentic-2' },
  });
  expect(requests[0].system).toContain('Return only the verification object');
  expect(requests[0].system).not.toContain('Return summary,nodes,edges,discussionProblems');
  expect(requests[1].system).toContain('Return summary,nodes,edges,discussionProblems');
  expect(requests[0].structuredOutput).toBe(true);
  expect(requests[1].structuredOutput).toBe(false);
});

test('현재 Verify는 서버가 검증한 구조 규칙을 다시 검사하지 않고, agentic-4 요청은 이전 프롬프트로 재현한다', async () => {
  const requests: AiProviderRequest[] = [];
  const adapter = new AiAdapter({ provider: 'agy' }, 'production', {
    async generate(request) {
      requests.push(request);
      return {
        value: request.outputSchema === VerificationSchema ? { valid: true, issues: [] } : graph,
      };
    },
  });
  const saved = {
    ...context(adapter),
    settings: { ...adapter.settings, promptVersion: 'agentic-4' },
  };
  await adapter.verifyGraph('대화', graph, context(adapter));
  await adapter.verifyGraph('대화', graph, saved);
  await adapter.extractGraph('대화', saved);
  const structureRule = 'Every edge sourceId and targetId must reference existing nodes';
  expect(requests[0].system).not.toContain(structureRule);
  expect(requests[0].system).toContain('Do NOT report structural');
  expect(requests[1].system).toContain(structureRule);
  expect(requests[2].outputSchema).not.toBe(GraphSchema);
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
    message: 'Unsupported AI_PROVIDER; expected agy or nvidia',
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

  // 로컬 .env의 AI_MAX_OUTPUT_TOKENS에 기대지 않고 코드 기본값을 확인한다(CI에는 .env가 없다).
  vi.stubEnv('AI_MAX_OUTPUT_TOKENS', '');
  const nvidia = new AiAdapter({ provider: 'nvidia' }, 'production', provider);
  vi.unstubAllEnvs();
  await expect(nvidia.extractGraph('input', context(nvidia))).resolves.toEqual({ value: graph });
  await expect(
    nvidia.extractGraph('input', {
      ...context(nvidia),
      settings: { ...nvidia.settings, maxInputTokens: 100 },
    }),
  ).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('preflight') });
  expect(nvidia.settings.maxOutputTokens).toBe(8192);
  expect(nvidia.settings.model).toBe('nvidia/nemotron-3.5-super-vl-120b-a12b');
});

test('AiAdapter records latency and telemetry metrics on success and failure', async () => {
  const recordedMetrics: any[] = [];
  const mockProvider: AiProvider = {
    generate: async request => {
      if (request.model === 'fail') throw new Error('Provider exploded');
      return { value: graph, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  const adapter = new AiAdapter(
    { provider: 'nvidia', model: 'success-model' },
    'production',
    mockProvider,
    metric => recordedMetrics.push(metric),
  );

  await adapter.extractGraph('대화 내용', {
    ...context(adapter),
    requestId: 'request-1',
    callId: 'call-1',
    traceId: 'trace-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
  });
  expect(recordedMetrics.length).toBe(1);
  expect(recordedMetrics[0]).toMatchObject({
    stage: 'extract',
    model: 'success-model',
    provider: 'nvidia',
    inputTokens: 100,
    outputTokens: 50,
    success: true,
    requestId: 'request-1',
    callId: 'call-1',
    traceId: 'trace-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    promptVersion: adapter.settings.promptVersion,
    totalTokens: 150,
  });
  expect(typeof recordedMetrics[0].durationMs).toBe('number');

  const failingAdapter = new AiAdapter(
    { provider: 'nvidia', model: 'fail' },
    'production',
    mockProvider,
    metric => recordedMetrics.push(metric),
  );
  await expect(
    failingAdapter.extractGraph('대화 내용', {
      ...context(failingAdapter),
      requestId: 'request-1',
      callId: 'call-2',
    }),
  ).rejects.toThrow('Provider exploded');
  expect(recordedMetrics.length).toBe(2);
  expect(recordedMetrics[1]).toMatchObject({
    stage: 'extract',
    model: 'fail',
    provider: 'nvidia',
    success: false,
    requestId: 'request-1',
    callId: 'call-2',
    failureKind: 'provider',
    failureStage: 'extract',
    errorSummary: 'AI provider failed',
  });
  expect(recordedMetrics[1]).not.toHaveProperty('error');
});

test('AiAdapter enforces character limits and keeps mock output limited to development and tests', async () => {
  const provider: AiProvider = {
    generate: async () => {
      throw new Error('Provider must not run for invalid input');
    },
  };
  const metrics: any[] = [];
  const adapter = new AiAdapter({ provider: 'agy' }, 'production', provider, metric =>
    metrics.push(metric),
  );
  await expect(
    adapter.extractGraph('too long', {
      ...context(adapter),
      settings: { ...adapter.settings, maxInputChars: 1 },
    }),
  ).rejects.toMatchObject({ statusCode: 422, message: 'AI input limit exceeded' });
  expect(metrics[0]).toMatchObject({
    success: false,
    failureKind: 'configuration',
    status: 422,
  });

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
