import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from '../dist/repositories/decision.repository.js';

// Explicit destination only; use an isolated migrated DB first, then review results.
const [snapshotPath, destinationUrl] = process.argv.slice(2);
if (!snapshotPath || !destinationUrl?.startsWith('file:/'))
  throw new Error(
    'Usage: node scripts/import-legacy.mjs SNAPSHOT.json file:/absolute/target.sqlite',
  );
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
const client = new PrismaClient({ datasources: { db: { url: destinationUrl } } });
try {
  const source = snapshot.tables.decisions;
  if (!source)
    throw new Error(
      'This importer accepts legacy lowercase decisions exports only; Prisma-schema copies use migrate deploy',
    );
  const ids = source.map(row => row.id);
  const collisions = await client.decision.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (collisions.length)
    throw new Error(
      `Conflicting decision IDs, no import performed: ${collisions.map(r => r.id).join(', ')}`,
    );
  const checkpoints = snapshot.tables.channel_checkpoints ?? [];
  for (const checkpoint of checkpoints) {
    const existing = await client.channelCheckpoint.findUnique({
      where: { channelId: checkpoint.channel_id },
    });
    if (existing && existing.lastMessageId !== checkpoint.last_message_id)
      throw new Error(`Conflicting checkpoint: ${checkpoint.channel_id}; no import performed`);
  }
  await client.$transaction(async tx => {
    const repo = new DecisionRepository(tx);
    for (const row of source) {
      const source = JSON.parse(row.source);
      const decision = {
        id: row.id,
        topic: row.topic,
        decision: row.decision,
        rationale: row.rationale,
        actionItems: JSON.parse(row.action_items).map((item, index) => ({
          ...item,
          id: `${row.id}:legacy:${index}`,
          state: 'unknown',
        })),
        state: row.state,
        supersedesId: row.supersedes_id,
        source: { ...source, rawMessages: source.rawMessages ?? [] },
        createdAt: row.created_at,
        ...(row.raw_transcript ? { rawTranscript: row.raw_transcript } : {}),
        rationaleQuotes: [],
        alternatives: [],
        categoryTag: '기타',
        isPivot: false,
        approvedBy: null,
        decisionConfirmedDate: null,
        feedbackSourceType: null,
        feedbackSourceDetail: null,
        feedbackReceivedDate: null,
        rawEvidence: [],
        version: 1,
      };
      await tx.decision.create({ data: { id: row.id, ...repo.decisionData(decision) } });
    }
    for (const row of checkpoints)
      await tx.channelCheckpoint.upsert({
        where: { channelId: row.channel_id },
        update: {},
        create: {
          channelId: row.channel_id,
          lastMessageId: row.last_message_id,
          updatedAt: new Date(row.updated_at),
        },
      });
  });
  console.log(
    `Imported ${source.length} decisions and ${checkpoints.length} checkpoints; historical completion remains unknown.`,
  );
} finally {
  await client.$disconnect();
}
