import { expect, test } from 'vitest';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { assertStorageReady } from '../src/repositories/storage-readiness.js';

test('startup rejects a missing queue table before serving analysis requests', async () => {
  const db = await isolatedRepository();
  try {
    await expect(assertStorageReady(db.client)).resolves.toBeUndefined();
    await db.client.$executeRawUnsafe('DROP TABLE AnalysisExecution');
    await expect(assertStorageReady(db.client)).rejects.toThrow(/AnalysisExecution.*db:migrate/);
  } finally {
    await db.cleanup();
  }
});
