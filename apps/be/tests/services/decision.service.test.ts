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
