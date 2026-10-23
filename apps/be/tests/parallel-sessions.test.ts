import { expect, test, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { DiscussionService } from '../src/services/discussion.service.js';
import { DecisionExtractorCore } from '../src/engine/extractor-core.js';
import type { IAiAdapter } from '../src/adapters/ai.adapter.js';
import { AppError } from '../src/errors/AppError.js';

const input = (id: string) => ({
  requestId: id,
  guildId: 'g',
  channelId: 'c',
  isManualOverride: true,
  rawMessages: Array.from({ length: 4 }, (_, index) => ({
    id: String(index + 1),
    author: 'Lee',
    content: `PostgreSQL 데이터베이스 기능 ${index} 도입을 논의합시다`,
    createdAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
  })),
});
const graph = { summary: '대화 문맥', nodes: [], edges: [], discussionProblems: [] };

test('N session workers overlap while the global call cap and original session order are preserved', async () => {
  vi.stubEnv('AI_SESSION_CONCURRENCY', '3');
  vi.stubEnv('AI_CALL_CONCURRENCY', '2');
  const db = await isolatedRepository();
  let active = 0,
    peak = 0;
  const ai: IAiAdapter = {
    async extractGraph(transcript, context) {
      active++;
      peak = Math.max(peak, active);
      try {
        await delay(50, undefined, { signal: context.signal });
        return { value: { ...graph, summary: transcript } };
      } finally {
        active--;
      }
    },
    async verifyGraph() {
      return { value: { valid: true, issues: [] } };
    },
    async repairGraph() {
      throw new Error('No repairs expected');
    },
  };
  try {
    const service = new DiscussionService(db.repo, ai, new DecisionExtractorCore());
    await service.analyzeDiscussion(input('parallel'));
    const snapshot = await service.getGraph('parallel', 'g');
    expect(snapshot.sessions).toHaveLength(4);
    expect(peak).toBe(2);
    expect(snapshot.sessions.map(session => session.inputMessageIds)).toEqual([
      ['1'],
      ['2'],
      ['3'],
      ['4'],
    ]);
    expect(await db.client.aiCallLease.count()).toBe(0);
  } finally {
    vi.unstubAllEnvs();
    await db.cleanup();
  }
});

test('a failed sibling cancels and drains others, publishes nothing, and retry reuses completed sessions', async () => {
  vi.stubEnv('AI_SESSION_CONCURRENCY', '2');
  vi.stubEnv('AI_CALL_CONCURRENCY', '2');
  const db = await isolatedRepository();
  const extracts: string[] = [];
  let fail = true,
    active = 0;
  const ai: IAiAdapter = {
    async extractGraph(transcript, context) {
      extracts.push(transcript);
      active++;
      try {
        const first = transcript.includes('"id":"1"');
        const second = transcript.includes('"id":"2"');
        await delay(first ? 1 : second ? 80 : 200, undefined, { signal: context.signal });
        if (second && fail) throw new AppError('Temporary analysis failure', 503);
        return { value: graph };
      } finally {
        active--;
      }
    },
    async verifyGraph() {
      return { value: { valid: true, issues: [] } };
    },
    async repairGraph() {
      throw new Error('No repairs expected');
    },
  };
  try {
    const service = new DiscussionService(db.repo, ai, new DecisionExtractorCore());
    await expect(service.analyzeDiscussion(input('recover-parallel'))).rejects.toThrow();
    expect(active).toBe(0);
    expect(await db.client.decision.count()).toBe(0);
    expect(await db.client.aiCallLease.count()).toBe(0);
    expect((await service.getStatus('recover-parallel', 'g')).sessions[0].phase).toBe('done');
    fail = false;
    await service.analyzeDiscussion(input('recover-parallel'));
    expect(extracts.filter(text => text.includes('"id":"1"'))).toHaveLength(1);
    expect((await service.getStatus('recover-parallel', 'g')).state).toBe('completed');
  } finally {
    vi.unstubAllEnvs();
    await db.cleanup();
  }
});
