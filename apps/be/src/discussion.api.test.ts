import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.js';
import { isolatedRepository } from './repositories/test-database.js';

test('discussion analysis and candidate history require Bot service authentication', async () => {
  const db = await isolatedRepository();
  const server = await createServer(
    db.repo,
    {
      analyzeTranscript: async () => ({
        found: false,
        summary: 'No decision found',
        decisions: [],
      }),
    },
    { serviceToken: 'discussion-service-secret' },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const payload = {
    requestId: 'auth-check',
    rawMessages: [{ author: 'member', content: 'We discussed this.' }],
  };
  try {
    for (const request of [
      fetch(`${base}/api/discussions/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      fetch(`${base}/api/discussions/history/DEC-1`),
    ]) {
      const response = await request;
      assert.equal(response.status, 401);
    }

    const botHeaders = {
      Authorization: 'Bearer discussion-service-secret',
      'Content-Type': 'application/json',
    };
    const analysis = await fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: botHeaders,
      body: JSON.stringify(payload),
    });
    assert.equal(analysis.status, 200);
    assert.equal(((await analysis.json()) as any).found, false);

    const history = await fetch(`${base}/api/discussions/history/DEC-1`, { headers: botHeaders });
    assert.equal(history.status, 200);
    assert.deepEqual(await history.json(), []);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
