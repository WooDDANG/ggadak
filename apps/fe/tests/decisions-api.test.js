import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  entryPoints: ['src/api/decisions.api.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { decisionsApi } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('Decision Card lookup consumes the generated v1 response', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, '/api/v1/decisions?topic=Architecture');
    return new Response(
      JSON.stringify({
        success: true,
        code: 'OK',
        message: 'Success',
        data: { decisions: [{ id: 'DEC-101', topic: 'Architecture' }] },
      }),
    );
  };
  try {
    assert.deepEqual(await decisionsApi.getDecisions({ topic: 'Architecture' }), [
      { id: 'DEC-101', topic: 'Architecture' },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
