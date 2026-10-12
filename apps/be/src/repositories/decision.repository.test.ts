import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { DecisionSchema } from '@ggaddak/shared';
import { isolatedRepository } from './test-database.js';
import { DecisionRepository } from './decision.repository.js';
test('full decisions and supporting records survive repository restart', async () => {
  const db = await isolatedRepository();
  try {
    const decision = DecisionSchema.parse({
      id: 'restart',
      topic: 'Storage',
      decision: 'Use SQLite',
      rationale: 'Durable local storage',
      state: 'Draft',
      createdAt: '2020-01-01T00:00:00.000Z',
      source: {
        guildId: 'g',
        channelId: 'c',
        triggerMessageId: '1',
        participants: ['Lee'],
        rawMessages: [
          { id: '1', author: 'Lee', content: 'Use SQLite', createdAt: '2020-01-01T00:00:00.000Z' },
        ],
      },
      actionItems: [{ task: 'Migrate', assignee: 'Lee', dueDate: '2026-10-10' }],
      rationaleSummary: 'Local durability',
      rationaleQuotes: ['Lee: Use SQLite'],
      feedbackSourceType: '팀원',
      feedbackSourceDetail: 'Review',
      feedbackReceivedDate: '2020-01-02',
      rawEvidence: ['1'],
      evidenceHash: 'evidence',
      rawTranscript: 'Lee: Use SQLite',
      governanceScore: 3.5,
      governanceReason: 'Consensus',
      governancePassed: true,
    });
    await db.repo.saveDecision(decision);
    const saved = await db.repo.getDecisionById(decision.id);
    await db.repo.saveCheckpoint('c', '123456789012345678');
    await db.repo.saveFeedback({
      id: 'f',
      source: '팀원',
      detail: 'Review',
      content: 'Keep it local',
      channelId: 'c',
      createdAt: '2020-01-03T00:00:00.000Z',
    });
    await db.repo.recordRejectedEvidence('rejected');
    await db.client.$disconnect();
    const restarted = new PrismaClient({ datasources: { db: { url: db.url } } });
    const recovered = new DecisionRepository(restarted);
    const actual = await recovered.getDecisionById('restart');
    assert.deepEqual(actual, saved);
    assert.equal(actual?.actionItems[0]?.state, 'unknown');
    assert.ok(actual?.actionItems[0]?.id);
    assert.equal(actual?.source.rawMessages[0]?.content, 'Use SQLite');
    assert.equal(actual?.actionItems[0]?.task, 'Migrate');
    assert.equal(actual?.createdAt, '2020-01-01T00:00:00.000Z');
    assert.equal(await recovered.getCheckpoint('c'), '123456789012345678');
    assert.equal((await recovered.getRecentFeedbacks('c'))[0]?.detail, 'Review');
    assert.equal(await recovered.isEvidenceRejected('rejected'), true);
    await restarted.$disconnect();
  } finally {
    await db.cleanup();
  }
});

test('review edits persist approval, category and original timestamps after restart', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'edit',
        topic: 'Framework',
        decision: 'Old',
        rationale: 'Reason',
        source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
        createdAt: '2020-01-01T00:00:00.000Z',
      }),
    );
    const edited = await db.repo.reviewDecision('edit', 'confirm', {
      expectedVersion: 1,
      decisionContent: 'Reviewed content',
      categoryTag: '기술',
      approvedBy: 'Kim',
      rationaleSummary: 'Reviewed reason',
      rationaleQuotes: ['Evidence'],
    });
    assert.equal(edited?.version, 2);
    await db.client.$disconnect();
    const client = new PrismaClient({ datasources: { db: { url: db.url } } });
    const repo = new (await import('./decision.repository.js')).DecisionRepository(client);
    const recovered = await repo.getDecisionById('edit');
    assert.equal(recovered?.decisionContent, 'Reviewed content');
    assert.equal(recovered?.categoryTag, '기술');
    assert.equal(recovered?.approvedBy, 'Kim');
    assert.equal(recovered?.decisionConfirmedDate, edited?.decisionConfirmedDate);
    assert.equal(recovered?.createdAt, '2020-01-01T00:00:00.000Z');
    await client.$disconnect();
  } finally {
    await db.cleanup();
  }
});

test('database write failures propagate and failed startup cannot return a ready server', async () => {
  const { DecisionRepository } = await import('./decision.repository.js');
  const client = new PrismaClient({
    datasources: { db: { url: 'file:/does-not-exist/ggaddak/test.sqlite' } },
  });
  const repo = new DecisionRepository(client);
  await assert.rejects(repo.saveCheckpoint('c', '1'));
  const { createServer } = await import('../server.js');
  await assert.rejects(createServer(repo));
  await client.$disconnect();
});

test('stale review conflicts without changing a decision', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'stale',
        topic: 'Storage',
        decision: 'SQLite',
        rationale: 'Local',
        source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
        createdAt: '2020-01-01T00:00:00.000Z',
      }),
    );
    await db.repo.reviewDecision('stale', 'confirm', { expectedVersion: 1 });
    await assert.rejects(
      db.repo.reviewDecision('stale', 'reject', { expectedVersion: 1 }),
      /version|stale/i,
    );
    assert.equal((await db.repo.getDecisionById('stale'))?.state, 'Decided');
  } finally {
    await db.cleanup();
  }
});

test('replacement transfers open work, preserves completed history and commits both versions', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    await db.repo.saveDecision(
      DecisionSchema.parse({
        ...base,
        id: 'old',
        state: 'Decided',
        actionItems: [
          { id: 'todo', task: 'Migrate', state: 'open' },
          { id: 'done', task: 'Research', state: 'completed' },
        ],
      }),
    );
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'new', supersedesId: 'old' }));
    assert.equal((await db.repo.getDecisionById('old'))?.state, 'Decided');
    const next = await db.repo.reviewDecision('new', 'confirm', {
      expectedVersion: 1,
      resolution: 'replace',
      predecessorId: 'old',
      predecessorVersion: 1,
      taskDispositions: [{ actionItemId: 'todo', disposition: 'transfer' }],
    });
    const old = await db.repo.getDecisionById('old');
    assert.equal(old?.state, 'Superseded');
    assert.equal(old?.supersededById, 'new');
    assert.equal(old?.actionItems[1]?.state, 'completed');
    assert.equal(next?.actionItems[0]?.transferredFromActionItemId, 'todo');
    assert.equal(next?.isPivot, false);
  } finally {
    await db.cleanup();
  }
});

test('invalid replacement rolls back edits, classifies legacy tasks explicitly and retains independent decisions', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    await db.repo.saveDecision(
      DecisionSchema.parse({
        ...base,
        id: 'pre',
        state: 'Decided',
        actionItems: [{ id: 'legacy', task: 'Audit' }],
      }),
    );
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'candidate' }));
    await assert.rejects(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 1,
        title: 'Edited',
      }),
      /Classify/,
    );
    assert.equal((await db.repo.getDecisionById('pre'))?.state, 'Decided');
    assert.equal((await db.repo.getDecisionById('candidate'))?.version, 1);
    const next = await db.repo.reviewDecision('candidate', 'confirm', {
      expectedVersion: 1,
      resolution: 'replace',
      predecessorId: 'pre',
      predecessorVersion: 1,
      taskDispositions: [{ actionItemId: 'legacy', classification: 'completed' }],
    });
    assert.equal(next?.state, 'Decided');
    assert.equal((await db.repo.getDecisionById('pre'))?.actionItems[0]?.state, 'completed');
    await db.repo.saveDecision(
      DecisionSchema.parse({ ...base, id: 'independent', supersedesId: 'candidate' }),
    );
    await db.repo.reviewDecision('independent', 'confirm', {
      expectedVersion: 1,
      resolution: 'independent',
    });
    assert.equal((await db.repo.getDecisionById('candidate'))?.state, 'Decided');
    assert.equal((await db.repo.getDecisionById('independent'))?.supersedesId, null);
  } finally {
    await db.cleanup();
  }
});

test('concurrent replacement accepts one successor and leaves the losing candidate untouched', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    for (const id of ['pre', 'a', 'b'])
      await db.repo.saveDecision(
        DecisionSchema.parse({ ...base, id, state: id === 'pre' ? 'Decided' : 'Draft' }),
      );
    const results = await Promise.allSettled(
      ['a', 'b'].map(id =>
        db.repo.reviewDecision(id, 'confirm', {
          expectedVersion: 1,
          resolution: 'replace',
          predecessorId: 'pre',
          predecessorVersion: 1,
        }),
      ),
    );
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const rejection = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejection.reason.statusCode, 409);
    const decisions = await db.repo.getDecisions();
    assert.equal(decisions.filter(d => d.state === 'Draft').length, 1);
  } finally {
    await db.cleanup();
  }
});

test('replacement rejects cross guild or inactive predecessors and stale predecessor versions', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'candidate' }));
    await db.repo.saveDecision(
      DecisionSchema.parse({
        ...base,
        id: 'cross',
        state: 'Decided',
        source: { ...base.source, guildId: 'other' },
      }),
    );
    await assert.rejects(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'cross',
        predecessorVersion: 1,
      }),
      /same guild/,
    );
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'pre', state: 'Decided' }));
    await assert.rejects(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 2,
      }),
      /Stale/,
    );
    assert.equal((await db.repo.getDecisionById('candidate'))?.version, 1);
  } finally {
    await db.cleanup();
  }
});

test('replacement review rejects missing task dispositions and persists cancellation after restart', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    await db.repo.saveDecision(
      DecisionSchema.parse({
        ...base,
        id: 'pre',
        state: 'Decided',
        actionItems: [{ id: 'todo', task: 'Migrate', state: 'open' }],
      }),
    );
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'candidate' }));
    await assert.rejects(
      db.repo.reviewDecision('candidate', 'confirm', {
        resolution: 'replace',
        predecessorId: 'pre',
        expectedVersion: 1,
        predecessorVersion: 1,
      }),
      /unfinished/,
    );
    await db.repo.reviewDecision('candidate', 'confirm', {
      resolution: 'replace',
      predecessorId: 'pre',
      expectedVersion: 1,
      predecessorVersion: 1,
      taskDispositions: [{ actionItemId: 'todo', disposition: 'cancel' }],
    });
    await db.client.$disconnect();
    const client = new PrismaClient({ datasources: { db: { url: db.url } } });
    const restarted = new DecisionRepository(client);
    assert.equal((await restarted.getDecisionById('pre'))?.actionItems[0]?.state, 'canceled');
    assert.equal((await restarted.getDecisionById('candidate'))?.supersedesId, 'pre');
    await client.$disconnect();
  } finally {
    await db.cleanup();
  }
});

test('database failure after predecessor update rolls the entire replacement back', async () => {
  const db = await isolatedRepository();
  try {
    const base = {
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'pre', state: 'Decided' }));
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'candidate' }));
    // SQLite failure injection at the agreed real-database boundary.
    await db.client.$executeRawUnsafe(
      "CREATE TRIGGER fail_candidate BEFORE UPDATE ON Decision WHEN NEW.id = 'candidate' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END",
    );
    await assert.rejects(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 1,
      }),
    );
    assert.equal((await db.repo.getDecisionById('pre'))?.state, 'Decided');
    assert.equal((await db.repo.getDecisionById('pre'))?.version, 1);
    assert.equal((await db.repo.getDecisionById('candidate'))?.state, 'Draft');
  } finally {
    await db.cleanup();
  }
});

test('generic save cannot bypass versioned review transitions', async () => {
  const db = await isolatedRepository();
  try {
    const value = DecisionSchema.parse({
      id: 'draft',
      topic: 'Storage',
      decision: 'SQLite',
      rationale: 'Local',
      source: { guildId: 'g', channelId: 'c', triggerMessageId: '1' },
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await db.repo.saveDecision(value);
    const saved = (await db.repo.getDecisionById('draft'))!;
    await assert.rejects(db.repo.saveDecision({ ...saved, state: 'Decided' }), /review/);
    assert.equal((await db.repo.getDecisionById('draft'))?.state, 'Draft');
  } finally {
    await db.cleanup();
  }
});
