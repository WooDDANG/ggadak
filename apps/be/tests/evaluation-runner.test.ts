import { test, expect } from 'vitest';
import { AiAdapter } from '../src/adapters/ai.adapter.js';
import { evaluateRecords, budgetTransport } from '../src/evaluation/runner.js';

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
