import { test, expect } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ExtractGraphSchema,
  HistoryExtractGraphSchema,
  graphIssues,
} from '../../src/domain/decision-graph.js';

const graph = {
  summary: '캐시 도입',
  nodes: [
    { id: 'issue', type: 'Issue', summary: '로그인이 느리다' },
    {
      id: 'candidate',
      type: 'DecisionCandidate',
      summary: 'Redis 캐시를 도입한다',
      observation: 'agreed',
      rationaleStatus: 'not_stated',
      category: '기술',
    },
  ],
  edges: [{ id: 'e1', type: 'contains', sourceId: 'issue', targetId: 'candidate' }],
  discussionProblems: [],
};

test('결정 후보는 상태 변화 이력 없이 Extract 스키마와 구조 검증을 통과한다', () => {
  expect(ExtractGraphSchema.safeParse(graph).success).toBe(true);
  expect(graphIssues(ExtractGraphSchema.parse(graph) as any)).toEqual([]);
});

test('현재 Extract 스키마는 이력을 요청하지 않고, agentic-4 스키마는 이력을 요구한다', () => {
  expect(JSON.stringify(zodToJsonSchema(ExtractGraphSchema))).not.toContain('history');
  expect(HistoryExtractGraphSchema.safeParse(graph).success).toBe(false);
});
