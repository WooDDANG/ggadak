import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from './decision.repository.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
function migrate(url: string, ...args: string[]) {
  return execFileSync(
    process.execPath,
    [
      'apps/be/node_modules/prisma/build/index.js',
      'migrate',
      ...args,
      '--schema',
      'apps/be/prisma/schema.prisma',
    ],
    { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
  );
}

test('checked-in additive migrations preserve a legacy-schema fixture and missing history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ggaddak-legacy-'));
  const url = `file:${join(dir, 'legacy.sqlite')}`;
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const baseline = await readFile(
      join(root, 'apps/be/prisma/migrations/202610100001_legacy/migration.sql'),
      'utf8',
    );
    for (const statement of baseline.split(';').filter(part => part.trim()))
      await client.$executeRawUnsafe(statement);
    await client.$executeRawUnsafe(
      `INSERT INTO Decision (id,guildId,channelId,messageId,title,decisionSummary,keyReason,status,decisionMaker,participants,alternatives,tags,sourceJumpUrl,evidenceSummary,evidenceHash,governanceScore,governanceReason,governancePassed,createdAt,updatedAt) VALUES ('legacy','g','c','1','Storage','SQLite','Local','confirmed','AI','[]','[]','["기술"]','','','',3,'Consensus',1,1577836800000,1577836800000)`,
    );
    await client.$disconnect();
    migrate(url, 'resolve', '--applied', '202610100001_legacy');
    migrate(url, 'deploy');
    const repo = new DecisionRepository(client);
    const recovered = await repo.getDecisionById('legacy');
    assert.equal(recovered?.state, 'Decided');
    assert.equal(recovered?.createdAt, '2020-01-01T00:00:00.000Z');
    assert.equal(recovered?.approvedBy, null);
    assert.equal(recovered?.decisionConfirmedDate, null);
    assert.deepEqual(recovered?.source.rawMessages, []);
    assert.deepEqual(recovered?.actionItems, []);
    await repo.saveDecision({ ...recovered!, actionItems: [{ task: 'Legacy unclassified task' }] });
    await client.$disconnect();
    assert.equal((await repo.getDecisionById('legacy'))?.actionItems[0]?.state, 'unknown');
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true });
  }
});
