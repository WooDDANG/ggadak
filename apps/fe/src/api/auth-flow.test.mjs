import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function asModule(path, transform = x => x) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(transform(source)).toString('base64');
}
test('Login transport sends bearer and cookie credentials; server switching isolates query cache and logout clears auth', async () => {
  const sessionUrl = asModule('./session.ts');
  const session = await import(sessionUrl);
  const transport = await import(asModule('./transport.ts', source => source.replace("'./session'", JSON.stringify(sessionUrl))));
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window;
  const requests = []; const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ success: true, data: { guilds: [] } }), { status: requests.length === 3 ? 401 : 200 }); };
  try {
    session.setAccessToken('signed-jwt');
    await transport.authenticatedClient('/api/v1/auth/guilds');
    assert.equal(requests[0].options.headers.get('Authorization'), 'Bearer signed-jwt');
    assert.equal(requests[0].options.credentials, 'include');
    const cache = new Map([[JSON.stringify(session.decisionsQueryKey('g1')), ['DEC-1']]]);
    assert.equal(cache.get(JSON.stringify(session.decisionsQueryKey('g2'))), undefined);
    session.setAccessToken(''); await transport.authenticatedClient('/api/v1/auth/authorize');
    assert.equal(requests[1].options.headers.has('Authorization'), false);
    session.setAccessToken('expired'); await assert.rejects(() => transport.authenticatedClient('/api/v1/auth/me'));
    assert.equal(session.getAccessToken(), ''); assert.deepEqual(events, ['ggaddak:logout']);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});
