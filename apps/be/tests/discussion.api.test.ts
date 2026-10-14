import { fixtureAiAdapter } from '../src/test-support/ai-fixture.js';
import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';

test('discussion analysis and candidate history require Bot service authentication', async () => {
  const db = await isolatedRepository();
  const server = await createServer(
    db.repo,
    fixtureAiAdapter({
      analyzeTranscript: async () => ({
        found: false,
        summary: 'No decision found',
        decisions: [],
      }),
    }),
    { serviceToken: 'discussion-service-secret' },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const payload = {
    requestId: 'auth-check',
    rawMessages: [{ id: '1', author: 'member', content: 'We discussed this.' }],
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
      expect(response.status).toBe(401);
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
    expect(analysis.status).toBe(200);
    expect(((await analysis.json()) as any).found).toBe(false);

    const history = await fetch(`${base}/api/discussions/history/DEC-1`, { headers: botHeaders });
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual([]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});
