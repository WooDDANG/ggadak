import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from '../../src/repositories/decision.repository.js';
import 'reflect-metadata';
import { test, expect } from 'vitest';
import { DecisionSchema } from '@ggaddak/shared';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { DecisionService } from '../../src/services/decision.service.js';
import type { DecisionEditDto } from '../../src/dto/decision-edit.dto.js';

const original = (id: string, state = 'Decided') =>
  DecisionSchema.parse({
    id,
    state,
    topic: 'Storage',
    decision: 'SQLite',
    rationale: 'Local',
    source: { guildId: 'g', channelId: 'c', triggerMessageId: 'm' },
    createdAt: '2020-01-01T00:00:00.000Z',
  });
const edit: DecisionEditDto = {
  expectedVersion: 1,
  title: 'Storage',
  decision: 'PostgreSQL',
  rationale: 'Concurrency',
  category: '기술',
  alternatives: [],
};

test('concurrent Service edits accept one version and reject the other as a domain conflict', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(original('race'));
    const service = new DecisionService(db.repo);
    const results = await Promise.allSettled([
      service.editDecision('race', edit, 'first'),
      service.editDecision('race', { ...edit, decision: 'MySQL' }, 'second'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409 });
    expect(await service.getDecisionById('race')).toMatchObject({ version: 2, state: 'Decided' });
  } finally {
    await db.cleanup();
  }
});

test.each(['Superseded', 'Rejected'])('Service preserves historical %s records', async state => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(original('history', state));
    const service = new DecisionService(db.repo);
    await expect(service.editDecision('history', edit, 'editor')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(await service.getDecisionById('history')).toMatchObject({
      version: 1,
      decision: 'SQLite',
      state,
    });
  } finally {
    await db.cleanup();
  }
});

test('a failed audit write rolls the conditional decision edit back', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(original('audit'));
    await db.client.$executeRawUnsafe(
      "CREATE TRIGGER fail_audit BEFORE INSERT ON DecisionEdit BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END",
    );
    const service = new DecisionService(db.repo);
    await expect(service.editDecision('audit', edit, 'editor')).rejects.toBeDefined();
    expect(await service.getDecisionById('audit')).toMatchObject({
      version: 1,
      decision: 'SQLite',
    });
  } finally {
    await db.cleanup();
  }
});

test('a failed rejected-evidence write rolls the review state change back', async () => {
  const db = await isolatedRepository();
  try {
    const service = new DecisionService(db.repo);
    await service.saveDecision({
      ...original('rejection-audit', 'Draft'),
      evidenceHash: 'reject-hash',
    });
    await db.client.$executeRawUnsafe(
      "CREATE TRIGGER fail_rejection BEFORE INSERT ON RejectedEvidenceHash BEGIN SELECT RAISE(ABORT, 'injected rejection failure'); END",
    );
    await expect(
      service.reviewDecision('rejection-audit', 'reject', { expectedVersion: 1 }),
    ).rejects.toBeDefined();
    expect(await service.getDecisionById('rejection-audit')).toMatchObject({
      version: 1,
      state: 'Draft',
    });
    expect(await db.repo.isEvidenceRejected('reject-hash')).toBe(false);
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
    const edited = await new DecisionService(db.repo).reviewDecision('edit', 'confirm', {
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
    await new DecisionService(db.repo).reviewDecision('stale', 'confirm', { expectedVersion: 1 });
    await expect(
      new DecisionService(db.repo).reviewDecision('stale', 'reject', { expectedVersion: 1 }),
    ).rejects.toThrow(/version|stale/i);
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
    const next = await new DecisionService(db.repo).reviewDecision('new', 'confirm', {
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
      new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'pre',
        predecessorVersion: 1,
        title: 'Edited',
      }),
    ).rejects.toThrow(/Classify/);
    expect((await db.repo.getDecisionById('pre'))?.state).toBe('Decided');
    expect((await db.repo.getDecisionById('candidate'))?.version).toBe(1);
    const next = await new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
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
    await new DecisionService(db.repo).reviewDecision('independent', 'confirm', {
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
        new DecisionService(db.repo).reviewDecision(id, 'confirm', {
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
      new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
        expectedVersion: 1,
        resolution: 'replace',
        predecessorId: 'cross',
        predecessorVersion: 1,
      }),
    ).rejects.toThrow(/same guild/);
    await db.repo.saveDecision(DecisionSchema.parse({ ...base, id: 'pre', state: 'Decided' }));
    await expect(
      new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
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
      new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
        resolution: 'replace',
        predecessorId: 'pre',
        expectedVersion: 1,
        predecessorVersion: 1,
      }),
    ).rejects.toThrow(/unfinished/);
    await new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
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
      new DecisionService(db.repo).reviewDecision('candidate', 'confirm', {
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
