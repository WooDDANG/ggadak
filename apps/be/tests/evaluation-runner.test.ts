import { test, expect } from 'vitest';
import { AiAdapter } from '../src/adapters/ai.adapter.js';
import { evaluateRecords, budgetTransport } from '../src/evaluation/runner.js';
import { ExtractionResultSchema } from '../src/evaluation/baseline/schemas.js';

test('provider nullable baseline completes with decision fallback and does not normalize graph nulls', async () => {
  let calls = 0;
  const values = [
    {
      found: true,
      summary: 'DB',
      decisions: [
        {
          topic: 'DB',
          decision: 'PostgreSQL',
          decisionContent: null,
          rationale: 'Transactions',
          actionItems: [
            { task: 'Connect DB', id: null, dueDate: null, transferredFromDecisionId: null },
          ],
        },
      ],
    },
    {
      summary: 'Context',
      nodes: [{ id: 'i', type: 'Issue', summary: 'DB selection', assignee: null }],
      edges: [],
      discussionProblems: [],
    },
    { valid: true, issues: [] },
  ];
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture' },
    'production',
    async (_url, options) => {
      if (options?.method === 'GET')
        return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
      if (String(_url).endsWith(':countTokens')) return Response.json({ totalTokens: 10 });
      if (calls === 0) {
        const schema = JSON.parse(options!.body as string).generationConfig.responseJsonSchema;
        const decisions = schema.properties.decisions.anyOf.find(
          (option: { type?: string }) => option.type === 'array',
        );
        expect(decisions.items.properties.decisionContent.anyOf).toContainEqual({
          type: 'null',
        });
      }
      const value = values[calls++];
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } },
        ],
        usageMetadata: { promptTokenCount: 17, candidatesTokenCount: 9 },
      });
    },
  );
  const records = (await evaluateRecords(
    [
      {
        meetingId: 'nullable-baseline',
        split: 'dev',
        language: 'ko',
        input: {
          utterances: [{ id: '1', speaker: 'Lee', text: 'PostgreSQL로 결정하죠', startSeconds: 0 }],
        },
      },
    ],
    adapter,
  )) as any[];
  expect(records[0].baseline).toMatchObject({
    outcome: 'completed',
    candidates: [{ id: 'baseline-0', summary: 'PostgreSQL' }],
    usage: { calls: 1, inputTokens: 17, outputTokens: 9 },
  });
  expect(records[0].workflow).toMatchObject({ outcome: 'completed' });
  expect(records[0].workflow.graph.sessions[0].nodes[0].assignee).toBeNull();
  expect(calls).toBe(3);
});

test('baseline treats nullable optional fields as absent without inventing action metadata', () => {
  const decision = {
    topic: 'DB',
    decision: 'PostgreSQL',
    rationale: 'Transactions',
    actionItems: [{ task: 'Connect DB', assignee: '민수' }],
  };
  const omitted = ExtractionResultSchema.parse({
    found: true,
    summary: 'DB',
    decisions: [decision],
  });
  const nullable = ExtractionResultSchema.parse({
    found: true,
    summary: 'DB',
    decisions: [
      {
        ...decision,
        title: null,
        decisionContent: null,
        rationaleSummary: null,
        rationaleQuotes: null,
        alternatives: [{ id: null, option: 'SQLite', reason: 'Not chosen' }],
        categoryTag: null,
        isPivot: null,
        actionItems: [
          {
            task: 'Connect DB',
            assignee: '민수',
            id: null,
            state: null,
            dueDate: null,
            transferredFromDecisionId: null,
            transferredFromActionItemId: null,
            transferredToDecisionId: null,
          },
        ],
      },
    ],
  });
  expect(nullable.decisions[0].actionItems).toEqual(omitted.decisions[0].actionItems);
  expect(nullable.decisions[0].decisionContent).toBeUndefined();
  expect(nullable.decisions[0].alternatives).toEqual([{ option: 'SQLite', reason: 'Not chosen' }]);
  const explicit = ExtractionResultSchema.parse({
    found: true,
    summary: 'DB',
    decisions: [
      {
        ...decision,
        decisionContent: 'Use PostgreSQL',
        actionItems: [
          {
            task: 'Connect DB',
            id: 'a1',
            state: 'open',
            assignee: '민수',
            dueDate: '2026-10-20',
            transferredFromDecisionId: 'old',
            transferredFromActionItemId: 'old-a',
            transferredToDecisionId: 'next',
          },
        ],
      },
    ],
  });
  expect(explicit.decisions[0].actionItems[0]).toMatchObject({
    id: 'a1',
    dueDate: '2026-10-20',
    transferredFromDecisionId: 'old',
  });
  expect(
    ExtractionResultSchema.safeParse({
      found: true,
      summary: 'DB',
      decisions: [{ ...decision, rationale: null }],
    }).success,
  ).toBe(false);
});

test('baseline parsing failure preserves returned provider usage and workflow still completes', async () => {
  let calls = 0;
  const values = [
    {
      found: true,
      summary: 'Invalid',
      decisions: [{ topic: null, decision: 'DB', rationale: 'Reason' }],
    },
    { summary: 'Context', nodes: [], edges: [], discussionProblems: [] },
    { valid: true, issues: [] },
  ];
  const adapter = new AiAdapter(
    { provider: 'gemini', geminiApiKey: 'fixture' },
    'production',
    async (url, options) => {
      if (options?.method === 'GET')
        return Response.json({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });
      if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 10 });
      const value = values[calls++];
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } },
        ],
        usageMetadata: { promptTokenCount: 17, candidatesTokenCount: 9 },
      });
    },
  );
  const records = (await evaluateRecords(
    [
      {
        meetingId: 'invalid-baseline',
        split: 'dev',
        language: 'ko',
        input: {
          utterances: [{ id: '1', speaker: 'Lee', text: 'PostgreSQL로 결정하죠', startSeconds: 0 }],
        },
      },
    ],
    adapter,
  )) as any[];
  expect(records[0].baseline).toMatchObject({
    outcome: 'failed',
    candidates: [],
    usage: { calls: 1, inputTokens: 17, outputTokens: 9 },
  });
  expect(records[0].workflow.outcome).toBe('completed');
  expect(calls).toBe(3);
});

test('offline evaluation uses separate fixed baseline and workflow responses without provider calls', async () => {
  const adapter = new AiAdapter({ provider: 'mock' }, 'test', async () => {
    throw new Error('No network');
  });
  const graph = {
    summary: 'Question only',
    nodes: [{ id: 'i', type: 'Issue', summary: 'Login is slow' }],
    edges: [],
    discussionProblems: [],
  };
  const results = (await evaluateRecords(
    [
      {
        meetingId: 'fixture',
        split: 'dev',
        language: 'ko',
        input: {
          utterances: [{ id: 'u1', speaker: 'Lee', text: '로그인이 느려요', startSeconds: 0 }],
        },
      },
    ],
    adapter,
    {
      fixture: {
        baseline: [{ found: false, summary: 'No decision', decisions: [] }],
        extract: [graph],
        verify: [{ valid: true, issues: [] }],
        repair: [],
      },
    },
  )) as any[];
  expect(results[0].baseline).toMatchObject({
    outcome: 'completed',
    candidates: [],
    usage: { calls: 1 },
  });
  expect(results[0].workflow).toMatchObject({
    outcome: 'completed',
    candidates: [],
    usage: { calls: 2 },
  });
  expect(results[0].workflow.graph.sessions[0].nodes[0]).toMatchObject({
    type: 'Issue',
    summary: 'Login is slow',
  });
});

test('budget transport refuses the next paid call before exceeding call/token limits', async () => {
  let calls = 0;
  const bounded = budgetTransport(
    { maxCalls: 1, maxTokens: 100, maxOutputTokens: 20 },
    async () => {
      calls++;
      return Response.json({ usage: { total_tokens: 5 } });
    },
  );
  await bounded.transport('https://fixture', { body: '{}' });
  await expect(bounded.transport('https://fixture', { body: '{}' })).rejects.toThrow(/budget/i);
  expect(calls).toBe(1);
  expect(bounded.usage()).toEqual({ calls: 1, tokens: 5 });
});

test('Gemini preflight requests consume HTTP call budget without inventing generated token usage', async () => {
  const bounded = budgetTransport(
    { maxCalls: 3, maxTokens: 100, maxOutputTokens: 20 },
    async url => {
      if (String(url).endsWith(':countTokens')) return Response.json({ totalTokens: 1048576 });
      return Response.json({ usageMetadata: { totalTokenCount: 5 } });
    },
  );
  const model = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash';
  await bounded.transport(model, { method: 'GET' });
  await bounded.transport(model + ':countTokens', { method: 'POST', body: '{}' });
  await bounded.transport(model + ':generateContent', { method: 'POST', body: '{}' });
  expect(bounded.usage()).toEqual({ calls: 3, tokens: 5 });
  await expect(bounded.transport(model, { method: 'GET' })).rejects.toThrow(/budget/i);
});
