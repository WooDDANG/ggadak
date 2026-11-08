import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: new URL('../.env', import.meta.url) });
const child = spawn(
  'npm',
  [
    'run',
    'dev',
    '--workspace=apps/frontend-main',
    '--',
    '--port',
    process.env.FE_PORT || '3002',
    '--strictPort',
  ],
  { cwd: root, env: process.env, stdio: 'inherit' },
);
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
