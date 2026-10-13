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
