import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [
    require.resolve('prisma'),
    ...process.argv.slice(2),
    '--schema',
    fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  ],
  { cwd: root, env: process.env, stdio: 'inherit' },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
