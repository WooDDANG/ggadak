import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as viteServer } from 'vite';

export const chrome =
  process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const browserAvailable = existsSync(chrome);

/** Runs the real FE modules with a fixture fetch transport and an isolated browser profile. */
export async function runBrowserFixture(source) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await fs.mkdir(join(root, '.data'), { recursive: true });
  const directory = await fs.mkdtemp(join(root, '.data', 'review-browser-'));
  const profile = await fs.mkdtemp(join(tmpdir(), 'ggaddak-review-browser-'));
  const entry = join(directory, 'entry.tsx');
  await fs.writeFile(entry, source);
  const vite = await viteServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  const server = httpServer(async (req, res) => {
    if (req.url === '/fixture') {
      try {
        const html = await vite.transformIndexHtml(
          '/index.html',
          `<html><body><div id="root"></div><pre id="result">WAIT</pre><script type="module" src="/@fs/${entry}"></script></body></html>`,
        );
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('Fixture setup failed');
      }
    } else
      vite.middlewares(req, res, () => {
        res.writeHead(404);
        res.end();
      });
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return await new Promise((resolve, reject) => {
      const child = spawn(
        chrome,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${profile}`,
          '--dump-dom',
          '--virtual-time-budget=12000',
          `http://127.0.0.1:${server.address().port}/fixture`,
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let output = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Browser timed out'));
      }, 25000);
      child.stdout.on('data', data => {
        output += data;
      });
      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', () => {
        clearTimeout(timer);
        resolve(output);
      });
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await vite.close();
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(profile, { recursive: true, force: true });
  }
}
