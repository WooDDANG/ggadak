import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
function moduleUrl(path, transform = source => source) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(transform(source)).toString('base64');
}
const sessionUrl = moduleUrl('./session.ts');
const transportUrl = moduleUrl('./transport.ts', s =>
  s.replace("'./session'", JSON.stringify(sessionUrl)),
);
const generatedUrl = moduleUrl('./generated/index.ts', s =>
  s
    .replace("'../transport'", JSON.stringify(transportUrl))
    .replace(
      "'@tanstack/react-query'",
      JSON.stringify(pathToFileURL(require.resolve('@tanstack/react-query')).href),
    ),
);
const responseUrl = moduleUrl('./api-response.ts');
const browserUrl = moduleUrl('./browser-session.ts', s =>
  s
    .replace("'./generated'", JSON.stringify(generatedUrl))
    .replace("'./api-response'", JSON.stringify(responseUrl))
    .replace("'./transport'", JSON.stringify(transportUrl))
    .replace("'./session'", JSON.stringify(sessionUrl)),
);

test('browser bootstrap coalesces simultaneous tabs in a page, retries outages, and restores only permitted user-specific servers', async () => {
  const browser = await import(browserUrl);
  const previousFetch = globalThis.fetch,
    previousStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, '/api/v1/auth/session');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'include');
    return Response.json({
      success: true,
      data: { user: { id: 'u1' }, guilds: [{ id: 'a' }, { id: 'b' }], accessToken: 'memory-token' },
    });
  };
  try {
    const [a, b] = await Promise.all([
      browser.restoreBrowserLogin(),
      browser.restoreBrowserLogin(),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.user.id, b.user.id);
    browser.rememberServer('u1', 'b');
    assert.equal(browser.chooseServer('u1', [{ id: 'a' }, { id: 'b' }]), 'b');
    assert.equal(browser.chooseServer('u1', [{ id: 'a' }]), 'a');
    assert.equal(browser.chooseServer('u2', [{ id: 'a' }, { id: 'b' }]), 'a');
    assert.equal(browser.chooseServer('u1', []), '');
    globalThis.fetch = async () => Response.json({ message: 'Temporary outage' }, { status: 503 });
    await assert.rejects(browser.restoreBrowserLogin(), error => error.status === 503);
    globalThis.fetch = async () =>
      Response.json({
        success: true,
        data: { user: { id: 'u1' }, guilds: [], accessToken: 'renewed' },
      });
    assert.equal((await browser.restoreBrowserLogin()).accessToken, 'renewed');
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
  }
});

test('a changed login starts a fresh bootstrap while the previous user response is pending', async () => {
  const browser = await import(browserUrl),
    session = await import(sessionUrl);
  const previousFetch = globalThis.fetch;
  let release;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1)
      return new Promise(resolve => {
        release = resolve;
      });
    return Response.json({
      success: true,
      data: { user: { id: 'new' }, guilds: [], accessToken: 'new' },
    });
  };
  try {
    const old = browser.restoreBrowserLogin();
    const rejected = assert.rejects(old, error => error.status === 409);
    session.invalidateSession();
    assert.equal((await browser.restoreBrowserLogin()).user.id, 'new');
    release(
      Response.json({
        success: true,
        data: { user: { id: 'old' }, guilds: [], accessToken: 'old' },
      }),
    );
    await rejected;
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('expired access is recovered once before retry; a transient recovery error does not broadcast logout', async () => {
  const session = await import(sessionUrl),
    transport = await import(transportUrl);
  const previousFetch = globalThis.fetch,
    previousWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  let calls = 0;
  session.setAccessToken('expired');
  session.setSessionRecovery(async () => session.setAccessToken('renewed'));
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) return Response.json({ message: 'expired' }, { status: 401 });
    assert.equal(options.headers.get('Authorization'), 'Bearer renewed');
    return Response.json({ success: true, data: [] });
  };
  try {
    assert.equal((await transport.authorizedFetch('/api/v1/decisions')).status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(events, []);
    session.setSessionRecovery(async () => {
      throw new transport.ApiHttpError('offline', 503);
    });
    globalThis.fetch = async () => Response.json({ message: 'expired' }, { status: 401 });
    await assert.rejects(
      transport.authorizedFetch('/api/v1/decisions'),
      error => error.status === 503,
    );
    assert.deepEqual(events, []);
  } finally {
    session.setSessionRecovery();
    session.setAccessToken('');
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  }
});

test('a request started by a previous login is not replayed under a new user', async () => {
  const session = await import(sessionUrl),
    transport = await import(transportUrl);
  const previousFetch = globalThis.fetch;
  let release;
  const received = new Promise(resolve => {
    release = resolve;
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return received;
  };
  session.setAccessToken('old-user');
  session.setSessionRecovery(async () => session.setAccessToken('new-user'));
  try {
    const pending = transport.authorizedFetch('/api/v1/decisions');
    session.invalidateSession();
    session.setAccessToken('new-user');
    release(Response.json({ message: 'expired' }, { status: 401 }));
    await assert.rejects(pending, error => error.status === 409);
    assert.equal(calls, 1);
    assert.equal(session.getAccessToken(), 'new-user');
  } finally {
    session.setSessionRecovery();
    session.setAccessToken('');
    globalThis.fetch = previousFetch;
  }
});
