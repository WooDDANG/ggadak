import 'reflect-metadata';
import { test, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DecisionSchema } from '@ggaddak/shared';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { DecisionRepository } from '../../src/repositories/decision.repository.js';
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
    expect(actual).toEqual(saved);
    expect(actual?.actionItems[0]?.state).toBe('unknown');
    expect(actual?.actionItems[0]?.id).toBeTruthy();
    expect(actual?.source.rawMessages[0]?.content).toBe('Use SQLite');
    expect(actual?.actionItems[0]?.task).toBe('Migrate');
    expect(actual?.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(await recovered.getCheckpoint('c')).toBe('123456789012345678');
    expect((await recovered.getRecentFeedbacks('c'))[0]?.detail).toBe('Review');
    expect(await recovered.isEvidenceRejected('rejected')).toBe(true);
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
    expect(edited?.version).toBe(2);
    await db.client.$disconnect();
    const client = new PrismaClient({ datasources: { db: { url: db.url } } });
    const repo = new (
      await import('../../src/repositories/decision.repository.js')
    ).DecisionRepository(client);
    const recovered = await repo.getDecisionById('edit');
    expect(recovered?.decisionContent).toBe('Reviewed content');
    expect(recovered?.categoryTag).toBe('기술');
    expect(recovered?.approvedBy).toBe('Kim');
    expect(recovered?.decisionConfirmedDate).toBe(edited?.decisionConfirmedDate);
    expect(recovered?.createdAt).toBe('2020-01-01T00:00:00.000Z');
    await client.$disconnect();
  } finally {
    await db.cleanup();
  }
});

test('database write failures propagate and failed startup cannot return a ready server', async () => {
  const { DecisionRepository } = await import('../../src/repositories/decision.repository.js');
  const client = new PrismaClient({
    datasources: { db: { url: 'file:/does-not-exist/ggaddak/test.sqlite' } },
  });
  const repo = new DecisionRepository(client);
  await expect(repo.saveCheckpoint('c', '1')).rejects.toBeDefined();
  const { createServer } = await import('../../src/server.js');
  await expect(createServer(repo)).rejects.toBeDefined();
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
    await expect(db.repo.reviewDecision('stale', 'reject', { expectedVersion: 1 })).rejects.toThrow(
      /version|stale/i,
    );
    expect((await db.repo.getDecisionById('stale'))?.state).toBe('Decided');
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
    expect((await db.repo.getDecisionById('old'))?.state).toBe('Decided');
    const next = await db.repo.reviewDecision('new', 'confirm', {
      expectedVersion: 1,
      resolution: 'replace',
      predecessorId: 'old',
      predecessorVersion: 1,
      taskDispositions: [{ actionItemId: 'todo', disposition: 'transfer' }],
    });
    const old = await db.repo.getDecisionById('old');
    expect(old?.state).toBe('Superseded');
    expect(old?.supersededById).toBe('new');
    expect(old?.actionItems[1]?.state).toBe('completed');
    expect(next?.actionItems[0]?.transferredFromActionItemId).toBe('todo');
    expect(next?.isPivot).toBe(false);
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
    await expect(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 1,
        title: 'Edited',
      }),
    ).rejects.toThrow(/Classify/);
    expect((await db.repo.getDecisionById('pre'))?.state).toBe('Decided');
    expect((await db.repo.getDecisionById('candidate'))?.version).toBe(1);
    const next = await db.repo.reviewDecision('candidate', 'confirm', {
      expectedVersion: 1,
      resolution: 'replace',
      predecessorId: 'pre',
      predecessorVersion: 1,
      taskDispositions: [{ actionItemId: 'legacy', classification: 'completed' }],
    });
    expect(next?.state).toBe('Decided');
    expect((await db.repo.getDecisionById('pre'))?.actionItems[0]?.state).toBe('completed');
    await db.repo.saveDecision(
      DecisionSchema.parse({ ...base, id: 'independent', supersedesId: 'candidate' }),
    );
    await db.repo.reviewDecision('independent', 'confirm', {
      expectedVersion: 1,
      resolution: 'independent',
    });
    expect((await db.repo.getDecisionById('candidate'))?.state).toBe('Decided');
    expect((await db.repo.getDecisionById('independent'))?.supersedesId).toBe(null);
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
    expect(results.filter(result => result.status === 'fulfilled').length).toBe(1);
    const rejection = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejection.reason.statusCode).toBe(409);
    const decisions = await db.repo.getDecisions();
    expect(decisions.filter(d => d.state === 'Draft').length).toBe(1);
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
    await expect(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'cross',
        predecessorVersion: 1,
      }),
    ).rejects.toThrow(/same guild/);
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'pre', state: 'Decided' }));
    await expect(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 2,
      }),
    ).rejects.toThrow(/Stale/);
    expect((await db.repo.getDecisionById('candidate'))?.version).toBe(1);
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
    await expect(
      db.repo.reviewDecision('candidate', 'confirm', {
        resolution: 'replace',
        predecessorId: 'pre',
        expectedVersion: 1,
        predecessorVersion: 1,
      }),
    ).rejects.toThrow(/unfinished/);
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
    expect((await restarted.getDecisionById('pre'))?.actionItems[0]?.state).toBe('canceled');
    expect((await restarted.getDecisionById('candidate'))?.supersedesId).toBe('pre');
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
    await expect(
      db.repo.reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 1,
      }),
    ).rejects.toBeDefined();
    expect((await db.repo.getDecisionById('pre'))?.state).toBe('Decided');
    expect((await db.repo.getDecisionById('pre'))?.version).toBe(1);
    expect((await db.repo.getDecisionById('candidate'))?.state).toBe('Draft');
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
    await expect(db.repo.saveDecision({ ...saved, state: 'Decided' })).rejects.toThrow(/review/);
    expect((await db.repo.getDecisionById('draft'))?.state).toBe('Draft');
  } finally {
    await db.cleanup();
  }
});
