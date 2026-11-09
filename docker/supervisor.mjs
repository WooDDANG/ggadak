import { spawn } from 'node:child_process';

const migrate = spawn('npm', ['run', 'db:migrate', '--workspace=@ggaddak/be'], {
  cwd: '/app', stdio: 'inherit',
});
let children = [migrate];
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 8000);
  timer.unref();
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop('SIGINT'));
const migrationCode = await new Promise(resolve => {
  migrate.on('error', () => resolve(1));
  migrate.on('exit', code => resolve(code ?? 1));
});
if (migrationCode !== 0 || stopping) process.exit(migrationCode || 1);

children = [
  spawn('node', ['dist/index.js'], { cwd: '/app/apps/be', stdio: 'inherit' }),
  spawn('node', ['dist/index.js'], { cwd: '/app/apps/bot', stdio: 'inherit' }),
];
let remaining = children.length;
for (const child of children) {
  child.on('error', error => {
    console.error('Failed to start service:', error.message);
    process.exitCode = 1;
    stop();
  });
  child.on('close', (code, signal) => {
    remaining--;
    if (!stopping) {
      console.error(`Service exited unexpectedly (code=${code}, signal=${signal})`);
      process.exitCode = 1;
      stop();
    }
    if (!remaining) process.exit(process.exitCode ?? 0);
  });
}
