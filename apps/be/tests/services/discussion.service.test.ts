import { DecisionService } from '../../src/services/decision.service.js';
import 'reflect-metadata';
import { test, expect, vi } from 'vitest';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { DiscussionService } from '../../src/services/discussion.service.js';
import { DecisionExtractorCore } from '../../src/engine/extractor-core.js';
import { IAiAdapter } from '../../src/adapters/ai.adapter.js';
import { ExtractionResultSchema } from '../../src/extractor/schemas.js';
import { DecisionRepository } from '../../src/repositories/decision.repository.js';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { DecisionSchema } from '@ggaddak/shared';

const input = {
  requestId: 'request-one',
  guildId: 'guild',
  channelId: 'channel',
  isManualOverride: true,
  rawMessages: [
    { id: '100', author: 'Lee', content: 'SQLite를 채택합시다', createdAt: '2026-01-01T00:00:00Z' },
  ],
};

test('lost-response retry survives restart and does not repeat paid extraction, including no-decision', async () => {
  const db = await isolatedRepository();
  let calls = 0;
  const adapter: IAiAdapter = {
    async analyzeTranscript() {
      calls++;
      return { found: false, summary: 'No decision', decisions: [] };
    },
  };
  try {
    const first = await new DiscussionService(
      db.repo,
      adapter,
      new DecisionExtractorCore(),
    ).analyzeDiscussion(input);
    await db.client.$disconnect();
    const restarted = new PrismaClient({ datasources: { db: { url: db.url } } });
    const retry = await new DiscussionService(
      new DecisionRepository(restarted),
      adapter,
      new DecisionExtractorCore(),
    ).analyzeDiscussion(input);
    await restarted.$disconnect();
    expect(retry).toEqual(first);
    expect(calls).toBe(1);
  } finally {
    await db.cleanup();
  }
});

const extracted = (decision = 'Use SQLite') =>
  ExtractionResultSchema.parse({
    found: true,
    summary: 'Chosen',
    decisions: [{ topic: 'Database', decision, rationale: 'Local durability' }],
  });

test('original burst message IDs and reply targets remain available to extraction and stored evidence', async () => {
  const db = await isolatedRepository();
  const adapter: IAiAdapter = {
    async analyzeTranscript(transcript) {
      expect(transcript).toMatch(/\[101\]/);
      expect(transcript).toMatch(/replying to 101/);
      return extracted();
    },
  };
  try {
    const result = await new DiscussionService(
      db.repo,
      adapter,
      new DecisionExtractorCore(),
    ).analyzeDiscussion({
      ...input,
      rawMessages: [
        ...input.rawMessages,
        {
          id: '101',
          author: 'Lee',
          content: '로컬 저장이 필요합니다',
          createdAt: '2026-01-01T00:00:05Z',
        },
        {
          id: '102',
          author: 'Kim',
          content: '그 방식에 동의합니다',
          replyingTo: '101',
          createdAt: '2026-01-01T00:00:10Z',
        },
      ],
    });
    expect(result.decisions[0].rawEvidence).toEqual(['100', '101', '102']);
    expect(result.decisions[0].source.rawMessages[2].replyingTo).toBe('101');
  } finally {
    await db.cleanup();
  }
});

test('concurrent same-ID deliveries produce one committed candidate and changed payload conflicts', async () => {
  const db = await isolatedRepository();
  let entered!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => {
    resume = resolve;
  });
  let calls = 0;
  const adapter: IAiAdapter = {
    async analyzeTranscript() {
      calls++;
      entered();
      await waiting;
      return extracted();
    },
  };
  const service = new DiscussionService(db.repo, adapter, new DecisionExtractorCore());
  try {
    const first = service.analyzeDiscussion(input);
    await started;
    await expect(service.analyzeDiscussion(input)).rejects.toMatchObject({ status: 503 });
    resume();
    const result = await first;
    const replay = await service.analyzeDiscussion({ ...input, traceId: 'retry-trace' });
    expect(replay).toEqual(result);
    expect((await db.repo.getDecisions()).length).toBe(1);
    expect(calls).toBe(1);
    await expect(
      service.analyzeDiscussion({
        ...input,
        rawMessages: [{ ...input.rawMessages[0], content: 'Changed' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db.repo.getCheckpoint(input.channelId)).toBe(null);
  } finally {
    resume();
    await db.cleanup();
  }
});

test('a failed later session commits no partial candidates and retry can recover the same request', async () => {
  const db = await isolatedRepository();
  let calls = 0;
  let shouldFail = true;
  const adapter: IAiAdapter = {
    async analyzeTranscript() {
      calls++;
      if (calls === 2 && shouldFail) throw new Error('Provider unavailable');
      return extracted();
    },
  };
  const service = new DiscussionService(db.repo, adapter, new DecisionExtractorCore());
  const params = {
    ...input,
    rawMessages: [
      ...input.rawMessages,
      { id: '200', author: 'Kim', content: '배포를 확정합시다', createdAt: '2026-01-01T02:00:00Z' },
    ],
  };
  try {
    await expect(service.analyzeDiscussion(params)).rejects.toThrow(/Provider unavailable/);
    expect(await db.repo.getDecisions()).toEqual([]);
    shouldFail = false;
    const result = await service.analyzeDiscussion(params);
    expect(result.decisions.length).toBe(2);
    expect((await service.analyzeDiscussion(params)).decisions.length).toBe(2);
    expect(calls).toBe(4);
  } finally {
    await db.cleanup();
  }
});

test('exact reanalysis preserves reviewer edits and rejection while unrelated decisions survive in the same window', async () => {
  const db = await isolatedRepository();
  let output = extracted();
  const service = new DiscussionService(
    db.repo,
    {
      async analyzeTranscript() {
        return output;
      },
    },
    new DecisionExtractorCore(),
  );
  try {
    const first = await service.analyzeDiscussion(input);
    const original = first.decisions[0];
    await new DecisionService(db.repo).reviewDecision(original.id, 'edit', {
      expectedVersion: original.version!,
      decisionContent: 'Reviewer edited text',
    });
    const manual = await service.analyzeDiscussion({ ...input, requestId: 'manual-two' });
    expect(manual.decisions[0].id).toBe(original.id);
    expect(manual.decisions[0].state).toBe('Draft');
    expect(manual.decisions[0].decisionContent).toBe('Reviewer edited text');
    await new DecisionService(db.repo).reviewDecision(original.id, 'reject', {
      expectedVersion: manual.decisions[0].version!,
    });
    output = ExtractionResultSchema.parse({
      found: true,
      summary: 'Two decisions',
      decisions: [...extracted().decisions, ...extracted('Deploy on Monday').decisions],
    });
    const automatic = await service.analyzeDiscussion({
      ...input,
      requestId: 'auto-three',
      isManualOverride: false,
    });
    expect(automatic.decisions.length).toBe(1);
    expect(automatic.decisions[0].decision).toBe('Deploy on Monday');
    await new DecisionService(db.repo).reviewDecision(automatic.decisions[0].id, 'confirm', {
      expectedVersion: automatic.decisions[0].version!,
      approvedBy: 'Kim',
    });
    const changed = await service.analyzeDiscussion({ ...input, requestId: 'manual-four' });
    expect(changed.decisions.length).toBe(2);
    expect(changed.decisions.find(d => d.id === original.id)?.state).toBe('Rejected');
    expect(changed.decisions.find(d => d.id === automatic.decisions[0].id)?.state).toBe('Decided');
    const history = await service.getCandidateHistory(automatic.decisions[0].id);
    expect(history.some(h => h.previousRequestIds.includes('manual-two'))).toBeTruthy();
    expect(history.some(h => h.relatedCandidateIds.includes(original.id))).toBeTruthy();
  } finally {
    await db.cleanup();
  }
});

test('an abandoned claim recovers after lease expiry and its stale owner cannot commit', async () => {
  const db = await isolatedRepository();
  vi.useFakeTimers({ toFake: ['Date'] });
  let entered!: () => void;
  let resume!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const waiting = new Promise<void>(resolve => {
    resume = resolve;
  });
  const old = new DiscussionService(
    db.repo,
    {
      async analyzeTranscript() {
        entered();
        await waiting;
        return extracted('Old owner');
      },
    },
    new DecisionExtractorCore(),
  );
  const restarted = new DiscussionService(
    db.repo,
    {
      async analyzeTranscript() {
        return extracted('Recovered owner');
      },
    },
    new DecisionExtractorCore(),
  );
  try {
    const interrupted = old.analyzeDiscussion(input);
    await started;
    vi.setSystemTime(Date.now() + 60_001);
    const recovered = await restarted.analyzeDiscussion(input);
    resume();
    await expect(interrupted).rejects.toMatchObject({ status: 503 });
    expect(recovered.decisions[0].decision).toBe('Recovered owner');
    expect((await db.repo.getDecisions()).length).toBe(1);
    expect(await restarted.analyzeDiscussion(input)).toEqual(recovered);
  } finally {
    resume();
    vi.useRealTimers();
    await db.cleanup();
  }
});

test('partial overlap remains related and delivery reactions do not change canonical evidence identity', async () => {
  const db = await isolatedRepository();
  const service = new DiscussionService(
    db.repo,
    {
      async analyzeTranscript() {
        return extracted();
      },
    },
    new DecisionExtractorCore(),
  );
  try {
    const first = await service.analyzeDiscussion(input);
    const reacted = await service.analyzeDiscussion({
      ...input,
      requestId: 'reactions',
      rawMessages: [
        { ...input.rawMessages[0], reactionCount: 5, reactions: [{ emoji: '👀', count: 1 }] },
      ],
    });
    expect(reacted.decisions[0].id).toBe(first.decisions[0].id);
    const overlapping = await service.analyzeDiscussion({
      ...input,
      requestId: 'overlap',
      rawMessages: [
        ...input.rawMessages,
        {
          id: '101',
          author: 'Kim',
          content: '백업도 설정합시다',
          createdAt: '2026-01-01T00:00:20Z',
        },
      ],
    });
    expect(overlapping.decisions[0].id).not.toBe(first.decisions[0].id);
    expect((await db.repo.getDecisions()).length).toBe(2);
    expect(
      (await service.getCandidateHistory(first.decisions[0].id)).some(h =>
        h.relatedCandidateIds.includes(overlapping.decisions[0].id),
      ),
    ).toBeTruthy();
  } finally {
    await db.cleanup();
  }
});

test('a persistence failure rolls back candidates and completion together; the original request stays retryable', async () => {
  const db = await isolatedRepository();
  const service = new DiscussionService(
    db.repo,
    {
      async analyzeTranscript() {
        return extracted();
      },
    },
    new DecisionExtractorCore(),
  );
  try {
    // Infrastructure fault injection on an isolated fixture, after candidate INSERT in the transaction.
    await db.client.$executeRawUnsafe(
      `CREATE TRIGGER fail_history BEFORE INSERT ON CandidateAnalysis BEGIN SELECT RAISE(ABORT, 'disk write failure'); END`,
    );
    await expect(service.analyzeDiscussion(input)).rejects.toBeDefined();
    expect(await db.repo.getDecisions()).toEqual([]);
    await db.client.$executeRawUnsafe('DROP TRIGGER fail_history');
    const retry = await service.analyzeDiscussion(input);
    expect(retry.decisions.length).toBe(1);
    expect((await service.getCandidateHistory(retry.decisions[0].id)).length).toBe(1);
  } finally {
    await db.cleanup();
  }
});

test('legacy rejected evidence suppresses its original decision rather than every decision in the window', async () => {
  const db = await isolatedRepository();
  const legacyHash = createHash('sha256').update('100').digest('hex');
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'legacy-rejected',
        topic: 'Database',
        decision: 'Use SQLite',
        rationale: 'Durability',
        state: 'Rejected',
        evidenceHash: legacyHash,
        rawEvidence: ['100'],
        createdAt: '2026-01-02T00:00:00Z',
        source: {
          guildId: 'guild',
          channelId: 'channel',
          triggerMessageId: '100',
          rawMessages: input.rawMessages,
        },
      }),
    );
    await db.repo.recordRejectedEvidence(legacyHash);
    const service = new DiscussionService(
      db.repo,
      {
        async analyzeTranscript() {
          return ExtractionResultSchema.parse({
            found: true,
            summary: 'Two',
            decisions: [...extracted().decisions, ...extracted('Deploy on Monday').decisions],
          });
        },
      },
      new DecisionExtractorCore(),
    );
    const result = await service.analyzeDiscussion({ ...input, isManualOverride: false });
    expect(result.decisions.map(d => d.decision)).toEqual(['Deploy on Monday']);
  } finally {
    await db.cleanup();
  }
});
