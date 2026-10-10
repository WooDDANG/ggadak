import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolatedRepository } from '../repositories/test-database.js';
import { DiscussionService } from './discussion.service.js';
import { DecisionExtractorCore } from '../engine/extractor-core.js';
import { IAiAdapter } from '../adapters/ai.adapter.js';
import { ExtractionResultSchema } from '../extractor/schemas.js';
import { DecisionRepository } from '../repositories/decision.repository.js';
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
    assert.deepEqual(retry, first);
    assert.equal(calls, 1);
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
      assert.match(transcript, /\[101\]/);
      assert.match(transcript, /replying to 101/);
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
    assert.deepEqual(result.decisions[0].rawEvidence, ['100', '101', '102']);
    assert.equal(result.decisions[0].source.rawMessages[2].replyingTo, '101');
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
    await assert.rejects(service.analyzeDiscussion(input), { status: 503 });
    resume();
    const result = await first;
    const replay = await service.analyzeDiscussion({ ...input, traceId: 'retry-trace' });
    assert.deepEqual(replay, result);
    assert.equal((await db.repo.getDecisions()).length, 1);
    assert.equal(calls, 1);
    await assert.rejects(
      service.analyzeDiscussion({
        ...input,
        rawMessages: [{ ...input.rawMessages[0], content: 'Changed' }],
      }),
      { status: 409 },
    );
    assert.equal(await db.repo.getCheckpoint(input.channelId), null);
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
    await assert.rejects(service.analyzeDiscussion(params), /Provider unavailable/);
    assert.deepEqual(await db.repo.getDecisions(), []);
    shouldFail = false;
    const result = await service.analyzeDiscussion(params);
    assert.equal(result.decisions.length, 2);
    assert.equal((await service.analyzeDiscussion(params)).decisions.length, 2);
    assert.equal(calls, 4);
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
    await db.repo.reviewDecision(original.id, 'edit', {
      expectedVersion: original.version!,
      decisionContent: 'Reviewer edited text',
    });
    const manual = await service.analyzeDiscussion({ ...input, requestId: 'manual-two' });
    assert.equal(manual.decisions[0].id, original.id);
    assert.equal(manual.decisions[0].state, 'Draft');
    assert.equal(manual.decisions[0].decisionContent, 'Reviewer edited text');
    await db.repo.reviewDecision(original.id, 'reject', {
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
    assert.equal(automatic.decisions.length, 1);
    assert.equal(automatic.decisions[0].decision, 'Deploy on Monday');
    await db.repo.reviewDecision(automatic.decisions[0].id, 'confirm', {
      expectedVersion: automatic.decisions[0].version!,
      approvedBy: 'Kim',
    });
    const changed = await service.analyzeDiscussion({ ...input, requestId: 'manual-four' });
    assert.equal(changed.decisions.length, 2);
    assert.equal(changed.decisions.find(d => d.id === original.id)?.state, 'Rejected');
    assert.equal(changed.decisions.find(d => d.id === automatic.decisions[0].id)?.state, 'Decided');
    const history = await service.getCandidateHistory(automatic.decisions[0].id);
    assert.ok(history.some(h => h.previousRequestIds.includes('manual-two')));
    assert.ok(history.some(h => h.relatedCandidateIds.includes(original.id)));
  } finally {
    await db.cleanup();
  }
});

test('an abandoned claim recovers after lease expiry and its stale owner cannot commit', async t => {
  const db = await isolatedRepository();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
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
    t.mock.timers.setTime(Date.now() + 60_001);
    const recovered = await restarted.analyzeDiscussion(input);
    resume();
    await assert.rejects(interrupted, { status: 503 });
    assert.equal(recovered.decisions[0].decision, 'Recovered owner');
    assert.equal((await db.repo.getDecisions()).length, 1);
    assert.deepEqual(await restarted.analyzeDiscussion(input), recovered);
  } finally {
    resume();
    t.mock.timers.reset();
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
    assert.equal(reacted.decisions[0].id, first.decisions[0].id);
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
    assert.notEqual(overlapping.decisions[0].id, first.decisions[0].id);
    assert.equal((await db.repo.getDecisions()).length, 2);
    assert.ok(
      (await service.getCandidateHistory(first.decisions[0].id)).some(h =>
        h.relatedCandidateIds.includes(overlapping.decisions[0].id),
      ),
    );
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
    await assert.rejects(service.analyzeDiscussion(input));
    assert.deepEqual(await db.repo.getDecisions(), []);
    await db.client.$executeRawUnsafe('DROP TRIGGER fail_history');
    const retry = await service.analyzeDiscussion(input);
    assert.equal(retry.decisions.length, 1);
    assert.equal((await service.getCandidateHistory(retry.decisions[0].id)).length, 1);
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
    assert.deepEqual(
      result.decisions.map(d => d.decision),
      ['Deploy on Monday'],
    );
  } finally {
    await db.cleanup();
  }
});
