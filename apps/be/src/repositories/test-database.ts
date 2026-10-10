import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { DecisionRepository } from './decision.repository.js';

export async function isolatedRepository() {
  const dir = await mkdtemp(join(tmpdir(), 'ggaddak-db-'));
  const url = `file:${join(dir, 'test.sqlite')}`;
  execFileSync(
    process.execPath,
    [
      'apps/be/node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'apps/be/prisma/schema.prisma',
    ],
    {
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    },
  );
  const client = new PrismaClient({ datasources: { db: { url } } });
  return {
    dir,
    url,
    client,
    repo: new DecisionRepository(client),
    cleanup: async () => {
      await client.$disconnect();
      await rm(dir, { recursive: true });
    },
  };
}
