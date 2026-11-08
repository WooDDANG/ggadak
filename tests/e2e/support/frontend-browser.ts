import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { DecisionSchema } from '@ggaddak/shared';
import { createServer } from '../../../apps/be/src/server.js';
import { isolatedRepository } from '../../../apps/be/src/repositories/test-database.js';
import type {
  DiscordAuthAdapter,
  DiscordGuild,
} from '../../../apps/be/src/adapters/discord-auth.adapter.js';
import { testAuthConfig } from '../../../apps/be/src/test-support/auth.js';
import { AppError } from '../../../apps/be/src/errors/AppError.js';

export const chrome = [
  process.env.CHROME_EXECUTABLE,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((path): path is string => Boolean(path && existsSync(path)));

/** Only the external Discord provider is controlled. All browser API responses come from BE. */
export class BrowserDiscord implements DiscordAuthAdapter {
  installed: string[] | null = ['guild-1', 'foreign-installed'];
  canManage = false;
  verificationRateLimited = false;
  private verificationAttempts = 0;
  calls = { guilds: 0, inventory: 0 };
  async exchange(code: string) {
    return { access_token: code, refresh_token: code, expires_in: 3600 };
  }
  async refresh(token: string) {
    return this.exchange(token);
  }
  async identity(token: string) {
    return { id: token, username: token === 'bob' ? 'Bob' : 'Alice', avatar: null };
  }
  async guilds(token: string): Promise<DiscordGuild[]> {
    this.calls.guilds++;
    // External observation fixture: intermittent Discord 429 followed by a successful list.
    if (this.verificationRateLimited) {
      await new Promise(resolve => setTimeout(resolve, 30));
      if (this.verificationAttempts++ % 2 === 0)
        throw new AppError('Discord guild verification rate limited (429)', 502);
    }
    const guilds = [
      {
        id: 'guild-1',
        name: 'Installed project',
        icon: null,
        owner: this.canManage,
        permissions: this.canManage ? '32' : '0',
      },
      { id: 'guild-2', name: 'Second project', icon: null, owner: false, permissions: '0' },
    ];
    return token === 'bob' ? [guilds[1]] : guilds;
  }
}

interface BrowserResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}
type Control = { action: string; value?: unknown; event?: Record<string, unknown> };

export async function runFrontendJourney(
  journey: string,
  options: {
    autoLogin?: boolean;
    suffix?: string;
    tokenDueSoon?: boolean;
    tokenDelayMs?: number;
    withDecision?: boolean;
  } = {},
) {
  if (!chrome) throw new Error('Set CHROME_EXECUTABLE to run the frontend/backend browser suite');
  const { createServer: createViteServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const db = await isolatedRepository();
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let frontend: Awaited<ReturnType<typeof createViteServer>> | undefined;
  let profile: string | undefined;
  let browser: ReturnType<typeof spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const delayedRequests = new Set<ReturnType<typeof setTimeout>>();
  try {
    profile = await mkdtemp(join(tmpdir(), 'ggaddak-real-be-browser-'));
    const discord = new BrowserDiscord();
    if (options.withDecision) {
      discord.installed = ['guild-1', 'guild-2'];
      await db.repo.saveDecision(
        DecisionSchema.parse({
          id: 'card-1',
          topic: 'Architecture choice',
          decision: 'Saved decision',
          rationale: 'Saved rationale',
          state: 'Decided',
          actionItems: [],
          supersedesId: null,
          source: {
            guildId: 'guild-1',
            channelId: 'guild-1-channel',
            triggerMessageId: '100',
            participants: [],
          },
          createdAt: '2026-11-01T00:00:00.000Z',
        }),
      );
    }
    let clock = Date.now() - (options.tokenDueSoon ? 14 * 60_000 : 0);
    const authConfig = { ...testAuthConfig };
    const requests: Array<{ method: string; path: string; status: number }> = [];
    const arrivals: Array<{ method: string; path: string }> = [];
    server = await createServer(db.repo, undefined, {
      config: authConfig,
      discordAdapter: discord,
      now: () => clock,
      serviceToken: 'browser-event-fixture',
      guildInventoryAdapter: {
        listInstalledGuilds: async () => {
          discord.calls.inventory++;
          return discord.installed;
        },
      },
      botInstallationAdapter: {
        observeBotMembership: async () => 'installed',
        getApplicationId: async () => null,
      },
      channelAdapter: {
        list: async guildId => [
          { id: `${guildId}-channel`, guildId, name: 'general', type: 0, accessible: true },
        ],
      },
    });
    const application = server.listeners('request')[0] as import('node:http').RequestListener;
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const method = req.method ?? 'GET';
      const path = new URL(req.url ?? '/', 'http://fixture').pathname;
      arrivals.push({ method, path });
      res.once('finish', () => requests.push({ method, path, status: res.statusCode }));
      // Delay transport admission only: the real BE still authenticates and produces every response.
      if (path === '/api/v1/auth/token' && options.tokenDelayMs) {
        const pending = setTimeout(() => {
          delayedRequests.delete(pending);
          application.call(server, req, res);
        }, options.tokenDelayMs);
        delayedRequests.add(pending);
      } else application.call(server, req, res);
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const backend = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let resolveReport!: (result: BrowserResult) => void;
    const report = new Promise<BrowserResult>(resolve => {
      resolveReport = resolve;
    });
    const streamId = randomUUID();
    frontend = await createViteServer({
      root: resolve('apps/frontend-main'),
      cacheDir: join(profile, 'vite-cache'),
      configFile: false,
      appType: 'custom',
      plugins: [
        react(),
        {
          name: 'real-backend-browser',
          configureServer(vite) {
            vite.middlewares.use(async (req, res, next) => {
              const path = new URL(req.url ?? '/', 'http://fixture').pathname;
              if (path === '/__fixture/result' || path === '/__fixture/control') {
                try {
                  let body = '';
                  for await (const chunk of req) body += chunk;
                  res.setHeader('Content-Type', 'application/json');
                  if (path.endsWith('/result')) {
                    res.end('{}');
                    resolveReport(JSON.parse(body));
                    return;
                  }
                  const command = JSON.parse(body) as Control;
                  if (command.action === 'inventory')
                    discord.installed = command.value as string[] | null;
                  else if (command.action === 'verificationRateLimited')
                    discord.verificationRateLimited = command.value === true;
                  else if (command.action === 'manage') discord.canManage = command.value === true;
                  else if (command.action === 'advance') clock += Number(command.value);
                  else if (command.action === 'event') {
                    const response = await fetch(`${backend}/api/v1/internal/guild-access/events`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer browser-event-fixture',
                      },
                      body: JSON.stringify({ streamId, ...command.event }),
                    });
                    if (!response.ok) throw new Error(`Event rejected: ${response.status}`);
                  }
                  res.end(JSON.stringify({ requests, arrivals, provider: discord.calls }));
                } catch (error) {
                  res.statusCode = 500;
                  res.end(
                    JSON.stringify({
                      error: error instanceof Error ? error.message : 'fixture failed',
                    }),
                  );
                }
                return;
              }
              if (path !== '/') return next();
              const html = await vite.transformIndexHtml(
                '/',
                `<html><body><div id="root"></div><script type="module">
          import React from 'react'; import {createRoot} from 'react-dom/client'; import App from '/src/App.jsx';
          import * as api from '/src/api/endpoints.js';
          const wait = async (predicate) => { for(let i=0;i<300;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('screen condition timed out'); };
          const visible = el => Boolean(el && el.getClientRects().length);
          const button = text => [...document.querySelectorAll('button')].find(el => visible(el) && el.textContent.includes(text));
          const check = (condition, message) => { if(!condition)throw Error(message); };
          const control = async (action,value,event) => { const response=await fetch('/__fixture/control',{method:'POST',body:JSON.stringify({action,value,event})});if(!response.ok)throw Error('fixture control failed');return response.json(); };
          const stats = () => control('stats');
          const oauth = async (account, phase) => {
            const response=await fetch('/api/v1/auth/authorize',{credentials:'include'}); const result=await response.json();
            check(response.ok,'authorize failed'); const state=new URL(result.data.url).searchParams.get('state');
            sessionStorage.setItem('journey-phase',phase); window.location.assign('/?code='+encodeURIComponent(account)+'&state='+encodeURIComponent(state));
            await new Promise(()=>{});
          };
          const phase = sessionStorage.getItem('journey-phase');
          if (${options.autoLogin !== false} && !phase) await oauth('alice','active');
          createRoot(document.getElementById('root')).render(React.createElement(App));
          try { ${journey}; await fetch('/__fixture/result',{method:'POST',body:JSON.stringify({ok:true})}); }
          catch(error) { await fetch('/__fixture/result',{method:'POST',body:JSON.stringify({ok:false,error:error.message})}); }
        </script></body></html>`,
              );
              res.setHeader('Content-Type', 'text/html');
              res.end(html);
            });
          },
        },
      ],
      server: {
        host: '127.0.0.1',
        port: 0,
        proxy: { '/api': { target: backend, changeOrigin: true } },
      },
    });
    await frontend.listen();
    const origin = `http://127.0.0.1:${(frontend.httpServer!.address() as AddressInfo).port}`;
    authConfig.redirectUri = `${origin}/`;
    browser = spawn(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        `${origin}${options.suffix ?? '/'}`,
      ],
      { stdio: 'ignore' },
    );
    const startupError = new Promise<never>((_, reject) => browser!.once('error', reject));
    const result = await Promise.race([
      report,
      startupError,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Browser journey timed out')), 22000);
      }),
    ]);
    if (!result.ok) throw new Error(result.error ?? 'Browser journey failed');
    return { requests, arrivals, provider: { ...discord.calls } };
  } finally {
    clearTimeout(timer);
    for (const pending of delayedRequests) clearTimeout(pending);
    if (browser && browser.exitCode === null) {
      const closed = new Promise<void>(resolve => browser!.once('close', () => resolve()));
      browser.kill('SIGTERM');
      await closed;
    }
    await frontend?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server!.close(() => resolve()));
    }
    await db.cleanup();
    if (profile)
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
