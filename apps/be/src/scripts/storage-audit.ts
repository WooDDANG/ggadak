import 'reflect-metadata';
import '../config/index.js';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecisionRepository } from '../repositories/decision.repository.js';

export async function auditDecisionStorage(prisma: PrismaClient, batchSize = 100) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error('Invalid audit batch size');
  const repo = new DecisionRepository(prisma);
  const invalid: string[] = [],
    mismatches: { id: string; fields: string[] }[] = [];
  let cursor: string | undefined,
    rows = 0;
  while (true) {
    const batch = await prisma.decision.findMany({
      ...(cursor ? { where: { id: { gt: cursor } } } : {}),
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!batch.length) break;
    for (const row of batch) {
      rows++;
      try {
        const projected = repo.decisionData(repo.decodeDecision(row));
        const fields = Object.entries(projected)
          .filter(([key, value]) => {
            if (key === 'domainJson') return false;
            const actual = row[key as keyof typeof row];
            return (
              (actual instanceof Date ? actual.toISOString() : actual) !==
              (value instanceof Date ? value.toISOString() : value)
            );
          })
          .map(([key]) => key);
        if (fields.length) mismatches.push({ id: row.id, fields });
      } catch {
        invalid.push(row.id);
      }
    }
    cursor = batch.at(-1)!.id;
  }
  return { rows, invalid, mismatches };
}

async function main() {
  const index = process.argv.indexOf('--database');
  const prisma = new PrismaClient({
    ...(index >= 0
      ? { datasources: { db: { url: 'file:' + resolve(process.argv[index + 1]) } } }
      : {}),
  });
  try {
    const result = await auditDecisionStorage(prisma);
    console.log(JSON.stringify(result));
    if (result.invalid.length || result.mismatches.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Audit failed');
    process.exitCode = 1;
  });
