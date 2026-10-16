import { test, expect, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { apiLimiter } from '../src/api/middlewares/rateLimiter.js';
import { expressAuthentication } from '../src/api/authentication.js';
import { errorHandler } from '../src/api/middlewares/errorHandler.js';

test('valid Bot polling does not consume the browser IP limit while invalid credentials remain limited', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DISABLE_RATE_LIMIT', 'false');
  const app = express();
  app.locals.serviceToken = 'fixture-service-token';
  app.use('/api', apiLimiter);
  app.get('/api/v1/internal/poll', async (req, res, next) => {
    try {
      await expressAuthentication(req, 'service');
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  app.use(errorHandler);
  const server = createServer(app);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/v1/internal/poll`;
    for (let i = 0; i < 125; i++) {
      const response = await fetch(url, {
        headers: { Authorization: 'Bearer fixture-service-token' },
      });
      expect(response.status).toBe(204);
    }
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++)
      statuses.push(
        (await fetch(url, { headers: { Authorization: 'Bearer invalid-service-token' } })).status,
      );
    expect(statuses[0]).toBe(401);
    expect(statuses.at(-1)).toBe(429);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
  }
});
