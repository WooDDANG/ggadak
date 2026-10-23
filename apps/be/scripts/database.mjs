import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: root + '.env' });
const result = spawnSync(
  'python3',
  [fileURLToPath(new URL('./storage-database.py', import.meta.url)), ...process.argv.slice(2)],
  {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
