import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { DecisionSchema } from '@ggaddak/shared';
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
    const domainMigration = await readFile(
      join(root, 'apps/be/prisma/migrations/202610100002_domain/migration.sql'),
      'utf8',
    );
    for (const statement of domainMigration.split(';').filter(part => part.trim()))
      await client.$executeRawUnsafe(statement);
    const historical = DecisionSchema.parse({
      id: 'historical-string-id',
      topic: 'Architecture',
      title: 'Former choice',
      decision: 'Keep SQLite',
      rationale: 'Local deployment',
      state: 'Superseded',
      supersededById: 'replacement',
      categoryTag: '기술',
      source: {
        guildId: 'g',
        channelId: 'c',
        triggerMessageId: 'm',
        participants: ['Lee'],
        messageUrl: 'https://discord.com/channels/g/c/m',
      },
      createdAt: '2020-01-01T00:00:00.000Z',
      alternatives: [{ option: 'Postgres', reason: 'Operations' }],
      rawEvidence: ['message-1'],
      actionItems: [{ id: 'action-1', task: 'Backup', state: 'completed' }],
      version: 7,
    });
    await client.$executeRawUnsafe(
      `INSERT INTO Decision SELECT 'historical-string-id',guildId,channelId,messageId,title,decisionSummary,keyReason,status,decisionMaker,participants,alternatives,tags,supersedesId,supersededById,sourceJumpUrl,evidenceSummary,evidenceHash,governanceScore,governanceReason,governancePassed,createdAt,updatedAt,archivedAt,?,7 FROM Decision WHERE id='legacy'`,
      JSON.stringify(historical),
    );
    await client.$disconnect();
    migrate(url, 'resolve', '--applied', '202610100001_legacy');
    migrate(url, 'resolve', '--applied', '202610100002_domain');
    migrate(url, 'deploy');
    const repo = new DecisionRepository(client);
    const recovered = await repo.getDecisionById('legacy');
    assert.equal(recovered?.state, 'Decided');
    assert.equal(recovered?.source.guildId, 'g');
    assert.equal((await client.guild.findUnique({ where: { id: 'g' } }))?.name, 'g');
    assert.equal(await client.membership.count(), 0);

    assert.equal(recovered?.createdAt, '2020-01-01T00:00:00.000Z');
    assert.equal(recovered?.approvedBy, null);
    assert.equal(recovered?.decisionConfirmedDate, null);
    assert.deepEqual(recovered?.source.rawMessages, []);
    assert.deepEqual(recovered?.actionItems, []);
    await repo.saveDecision({ ...recovered!, actionItems: [{ task: 'Legacy unclassified task' }] });
    await client.$disconnect();
    assert.equal((await repo.getDecisionById('legacy'))?.actionItems[0]?.state, 'unknown');
    const restoredHistorical = await repo.getDecisionById('historical-string-id');
    const { updatedAt, ...legacyDomain } = restoredHistorical!;
    assert.equal(updatedAt, '2020-01-01T00:00:00.000Z');
    assert.deepEqual(legacyDomain, historical);
    const page = await repo.browseDecisions({
      guildId: 'g',
      status: 'SUPERSEDED',
      category: '기술',
      page: 1,
      size: 10,
    });
    assert.deepEqual(
      page.decisions.map(({ updatedAt: _updatedAt, ...decision }) => decision),
      [historical],
    );
    assert.equal(page.pageInfo.totalElements, 1);
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true });
  }
});
