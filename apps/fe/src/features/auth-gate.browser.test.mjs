import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';

const chrome =
  process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test(
  'AuthGate restores once in StrictMode, blocks data during outages, and synchronizes browser logout',
  { skip: !existsSync(chrome), timeout: 30000 },
  async () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const fixtures = join(root, '.data');
    await fs.mkdir(fixtures, { recursive: true });
    const dir = await fs.mkdtemp(join(fixtures, 'session-browser-'));
    const profile = await fs.mkdtemp(join(tmpdir(), 'ggaddak-session-chrome-'));
    const entry = join(dir, 'entry.tsx');
    await fs.writeFile(
      entry,
      `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '../../src/features/AuthGate';
import { CandidateHistory } from '../../src/features/review-queue/CandidateHistory';
let loginCalls=0, restoreCalls=0, outage=false;
let historyCalls=0;
window.fetch=async input=>{
 const path=String(input);
 if(path.includes('/history')){historyCalls++;return Response.json({success:true,data:[]});}
 if(path.includes('/auth/session')){restoreCalls++;if(outage)return Response.json({message:'offline'},{status:503});return Response.json({success:true,data:{accessToken:'fixture-token',user:{id:'fixture-user'},guilds:[{id:'a',name:'A'},{id:'b',name:'B'}]}});}
 if(path.includes('/auth/login')){loginCalls++;return Response.json({success:true,data:{accessToken:'fixture-token'}});}
 if(path.includes('/auth/logout'))return Response.json({success:true,data:null});
 throw new Error('Unexpected API request');
};
localStorage.setItem('ggaddak:server:fixture-user','b');
const wait=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('UI did not reach expected state');};
const protectedView=()=>document.getElementById('protected');
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><AuthGate>{id=><p id="protected">{id}</p>}</AuthGate></QueryClientProvider></React.StrictMode>);
(async()=>{
 try{
  await wait(protectedView);
  if(loginCalls!==1||restoreCalls!==1||protectedView()?.textContent!=='b')throw new Error('Callback replay or wrong remembered server');
  outage=true;window.dispatchEvent(new Event('focus'));
  await wait(()=>document.body.textContent?.includes('다시 연결'));
  if(protectedView())throw new Error('Server data remained accessible during outage');
  outage=false;Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='다시 연결')!.click();
  await wait(protectedView);
  window.dispatchEvent(new StorageEvent('storage',{key:'ggaddak:auth-event',newValue:JSON.stringify({action:'logout'})}));
  await wait(()=>document.body.textContent?.includes('Discord로 로그인'));
  if(protectedView())throw new Error('Other-tab logout did not clear protected view');
  window.dispatchEvent(new StorageEvent('storage',{key:'ggaddak:auth-event',newValue:JSON.stringify({action:'login'})}));
  await wait(protectedView);
  Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='로그아웃')!.click();
  await wait(()=>document.body.textContent?.includes('Discord로 로그인'));
  const historyContainer=document.createElement('div');document.body.append(historyContainer);
  const historyRoot=createRoot(historyContainer);
  historyRoot.render(<QueryClientProvider client={queryClient}><CandidateHistory decisionId="fixture" guildId="a" /></QueryClientProvider>);
  await wait(()=>historyContainer.querySelector('summary'));
  await new Promise(resolve=>setTimeout(resolve,100));
  if(historyCalls!==0)throw new Error('Collapsed candidate history sent requests');
  historyContainer.querySelector('summary')!.click();
  await wait(()=>historyCalls===1);
  historyContainer.querySelector('summary')!.click();
  await new Promise(resolve=>setTimeout(resolve,5200));
  if(historyCalls!==1)throw new Error('Closed candidate history kept polling');
  historyRoot.unmount();
  document.getElementById('result')!.textContent='PASS';
 }catch(error){document.getElementById('result')!.textContent='FAIL: '+(error as Error).message;}
})();
`,
    );
    const vite = await createViteServer({
      root,
      server: { middlewareMode: true },
      appType: 'custom',
    });
    const server = createHttpServer(async (req, res) => {
      if (req.url?.startsWith('/fixture')) {
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
      const port = server.address().port;
      const html = await new Promise((resolve, reject) => {
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
            '--virtual-time-budget=7000',
            `http://127.0.0.1:${port}/fixture?code=fixture-code&state=fixture-state`,
          ],
          { stdio: ['ignore', 'pipe', 'ignore'] },
        );
        let output = '';
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Headless browser timed out'));
        }, 20000);
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
      assert.match(
        html,
        /<pre id="result">PASS<\/pre>/,
        html.match(/<pre id="result">([^<]*)/)?.[1] || 'Browser fixture did not load',
      );
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await vite.close();
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(profile, { recursive: true, force: true });
    }
  },
);
