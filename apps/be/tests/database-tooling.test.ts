import { expect, test } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { isolatedRepository } from '../src/repositories/test-database.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('DB tooling checks the selected schema read-only and makes a consistent explicit backup', async () => {
  const db = await isolatedRepository();
  const script = join(root, 'apps/be/scripts/database.mjs');
  const args = ['--database', db.url.slice(5)];
  try {
    expect(
      JSON.parse(
        execFileSync(process.execPath, [script, 'check', ...args], { cwd: root, encoding: 'utf8' }),
      ).missingSchema,
    ).toEqual([]);
    const backup = JSON.parse(
      execFileSync(
        process.execPath,
        [script, 'backup', ...args, '--backup-dir', join(db.dir, 'backup')],
        { cwd: root, encoding: 'utf8' },
      ),
    );
    expect((await readFile(backup.backup)).subarray(0, 15).toString()).toBe('SQLite format 3');
    await db.client.$executeRawUnsafe('DROP TABLE AnalysisExecution');
    const failed = spawnSync(process.execPath, [script, 'check', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout).missingSchema).toContain('AnalysisExecution');
  } finally {
    await db.cleanup();
  }
});

test('explicit upgrade applies prerequisites before validating a legacy-only database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ggaddak-upgrade-'));
  const path = join(dir, 'legacy.sqlite');
  const url = `file:${path}`;
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sql = await readFile(
      join(root, 'apps/be/prisma/migrations/202610100001_legacy/migration.sql'),
      'utf8',
    );
    for (const statement of sql.split(';').filter(part => part.trim()))
      await client.$executeRawUnsafe(statement);
    await client.$executeRawUnsafe(
      `INSERT INTO Decision (id,guildId,channelId,messageId,title,decisionSummary,keyReason,status,decisionMaker,participants,alternatives,tags,sourceJumpUrl,evidenceSummary,evidenceHash,governanceScore,governanceReason,governancePassed,updatedAt) VALUES ('legacy','g','c','m','Storage','SQLite','Local','confirmed','AI','[]','[]','[]','','','',3,'Consensus',1,1577836800000)`,
    );
    await client.$disconnect();
    execFileSync(
      process.execPath,
      [
        'apps/be/node_modules/prisma/build/index.js',
        'migrate',
        'resolve',
        '--applied',
        '202610100001_legacy',
        '--schema',
        'apps/be/prisma/schema.prisma',
      ],
      { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
    );
    execFileSync(
      process.execPath,
      [
        join(root, 'apps/be/scripts/database.mjs'),
        'upgrade',
        '--database',
        path,
        '--backup-dir',
        join(dir, 'backup'),
        '--apply',
      ],
      { cwd: root, stdio: 'pipe' },
    );
    expect(
      (await client.decision.findUniqueOrThrow({ where: { id: 'legacy' } })).storageVersion,
    ).toBe(1);
    expect(await client.$queryRawUnsafe('PRAGMA foreign_key_check')).toEqual([]);
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
