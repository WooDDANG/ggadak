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
