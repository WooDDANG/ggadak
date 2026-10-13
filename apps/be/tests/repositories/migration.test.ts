import 'reflect-metadata';
import { test, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { DecisionSchema } from '@ggaddak/shared';
import { DecisionRepository } from '../../src/repositories/decision.repository.js';

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
    const syncMigration = await readFile(
      join(root, 'apps/be/prisma/migrations/202610120009_sync_jobs/migration.sql'),
      'utf8',
    );
    for (const statement of syncMigration.split(';').filter(part => part.trim()))
      await client.$executeRawUnsafe(statement);
    await client.$executeRawUnsafe(
      `INSERT INTO SyncJob (id,guildId,status,channelIdsJson,totalChannels,completedChannels,messagesScanned) VALUES ('legacy-sync','g','COMPLETED','["c"]',1,1,20)`,
    );
    await client.$disconnect();
    migrate(url, 'resolve', '--applied', '202610100001_legacy');
    migrate(url, 'resolve', '--applied', '202610100002_domain');
    migrate(url, 'resolve', '--applied', '202610120009_sync_jobs');
    migrate(url, 'deploy');
    const repo = new DecisionRepository(client);
    const recovered = await repo.getDecisionById('legacy');
    expect(recovered?.state).toBe('Decided');
    expect(recovered?.source.guildId).toBe('g');
    expect((await client.guild.findUnique({ where: { id: 'g' } }))?.name).toBe('g');
    expect(await client.membership.count()).toBe(0);
    const { SyncJobService } = await import('../../src/services/sync-job.service.js');
    expect(await new SyncJobService(repo).get('legacy-sync', 'g')).toMatchObject({
      status: 'COMPLETED',
      totalChannels: 1,
      completedChannels: 1,
      messagesScanned: 20,
    });

    expect(recovered?.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(recovered?.approvedBy).toBe(null);
    expect(recovered?.decisionConfirmedDate).toBe(null);
    expect(recovered?.source.rawMessages).toEqual([]);
    expect(recovered?.actionItems).toEqual([]);
    await repo.saveDecision({ ...recovered!, actionItems: [{ task: 'Legacy unclassified task' }] });
    await client.$disconnect();
    expect((await repo.getDecisionById('legacy'))?.actionItems[0]?.state).toBe('unknown');
    const restoredHistorical = await repo.getDecisionById('historical-string-id');
    const { updatedAt, ...legacyDomain } = restoredHistorical!;
    expect(updatedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(legacyDomain).toEqual(historical);
    const page = await repo.browseDecisions({
      guildId: 'g',
      status: 'SUPERSEDED',
      category: '기술',
      page: 1,
      size: 10,
    });
    expect(page.decisions.map(({ updatedAt: _updatedAt, ...decision }) => decision)).toEqual([
      historical,
    ]);
    expect(page.pageInfo.totalElements).toBe(1);
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true });
  }
});
