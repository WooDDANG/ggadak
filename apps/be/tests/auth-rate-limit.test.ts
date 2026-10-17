import { test, expect, vi } from 'vitest';
import express from 'express';
import { apiLimiter } from '../src/api/middlewares/rateLimiter.js';

test('exhausting data requests does not block browser session recovery', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DISABLE_RATE_LIMIT', 'false');
  const app = express();
  app.use('/api', apiLimiter);
  app.get('/api/v1/decisions', (_req, res) => res.sendStatus(200));
  app.post('/api/v1/auth/session', (_req, res) => res.sendStatus(200));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (let i = 0; i < 120; i++)
      expect((await fetch(`${base}/api/v1/decisions`)).status).toBe(200);
    expect((await fetch(`${base}/api/v1/decisions`)).status).toBe(429);
    for (let i = 0; i < 120; i++)
      expect((await fetch(`${base}/api/v1/auth/session`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${base}/api/v1/auth/session`, { method: 'POST' })).status).toBe(429);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
  }
});
