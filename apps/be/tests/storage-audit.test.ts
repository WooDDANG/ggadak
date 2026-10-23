import { expect, test } from 'vitest';
import { DecisionSchema } from '@ggaddak/shared';
import { auditDecisionStorage } from '../src/scripts/storage-audit.js';
import { isolatedRepository } from '../src/repositories/test-database.js';

test('storage audit detects a projection mismatch created outside the canonical write boundary', async () => {
  const db = await isolatedRepository();
  try {
    await db.repo.saveDecision(
      DecisionSchema.parse({
        id: 'audit',
        topic: 'DB',
        decision: 'PostgreSQL',
        rationale: '',
        state: 'Draft',
        source: { guildId: 'g', channelId: 'c', triggerMessageId: 'm' },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(await auditDecisionStorage(db.client)).toEqual({ rows: 1, invalid: [], mismatches: [] });
    await db.client.decision.update({ where: { id: 'audit' }, data: { category: '기술' } });
    expect((await auditDecisionStorage(db.client)).mismatches).toEqual([
      { id: 'audit', fields: ['category'] },
    ]);
  } finally {
    await db.cleanup();
  }
});
