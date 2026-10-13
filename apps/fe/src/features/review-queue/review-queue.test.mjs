import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const cache = new Map();
function moduleUrl(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const compiled = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const linked = compiled.replace(/from (['"])([^'"]+)\1/g, (_all, _quote, path) => {
    const target = path.startsWith('.')
      ? moduleUrl(
          [path + '.tsx', path + '.ts', path + '/index.ts']
            .map(p => new URL(p, url))
            .find(p => fs.existsSync(p)),
        )
      : pathToFileURL(require.resolve(path)).href;
    return `from ${JSON.stringify(target)}`;
  });
  const result = 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
  cache.set(url.href, result);
  return result;
}

test('held candidates remain reviewable and replacement picker offers only confirmed records', async () => {
  const { ReviewQueue } = await import(moduleUrl(new URL('./ReviewQueue.tsx', import.meta.url)));
  const candidate = {
    id: 'candidate',
    topic: 'Storage',
    title: 'Held candidate',
    state: 'Deferred',
    version: 2,
    createdAt: '2026-01-01T00:00:00Z',
    actionItems: [],
    alternatives: [],
    source: {},
  };
  const html = renderToStaticMarkup(
    React.createElement(ReviewQueue, {
      decisions: [candidate],
      records: [
        { ...candidate, id: 'old', title: 'Current record', state: 'Decided' },
        { ...candidate, id: 'retired', title: 'Retired record', state: 'Superseded' },
      ],
      onReview: async () => {},
      isLoading: false,
    }),
  );
  assert.match(html, /Held candidate/);
  assert.match(html, /보류/);
  assert.match(html, /독립적으로 확정/);
  assert.match(html, /교체: Current record/);
  assert.match(html, /확정·반려 이력/);
  assert.match(html, /Retired record/);
  assert.doesNotMatch(html, /교체: Retired record/);
});
