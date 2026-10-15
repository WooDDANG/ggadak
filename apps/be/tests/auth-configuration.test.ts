import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions } from '../src/test-support/auth.js';

test('Discord authorize explains missing root OAuth settings without returning credentials', async () => {
  const db = await isolatedRepository();
  const options = fakeAuthOptions();
  options.config = {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    secret: '',
    secureCookie: false,
  };
  const server = await createServer(db.repo, undefined, options);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as any).port}/api/v1/auth/authorize`,
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as any;
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.message).toContain('Discord login is not configured');
    for (const key of [
      'DISCORD_CLIENT_ID',
      'DISCORD_CLIENT_SECRET',
      'DISCORD_REDIRECT_URI',
      'AUTH_SECRET',
    ]) {
      expect(body.message).toContain(key);
    }
    expect(body.message).toContain('.env');
    expect(body.data).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

test('OAuth configuration errors expose setting names rather than invalid credential values', async () => {
  const { validateAuthConfig } = await import('../src/config/index.js');
  const { testAuthConfig } = await import('../src/test-support/auth.js');
  expect(() => validateAuthConfig(testAuthConfig)).not.toThrow();
  try {
    validateAuthConfig({
      ...testAuthConfig,
      secret: 'private-secret',
      redirectUri: 'private-invalid-uri',
    });
    expect.fail('Invalid OAuth settings must fail');
  } catch (error) {
    expect((error as Error).message).toContain('AUTH_SECRET');
    expect((error as Error).message).toContain('DISCORD_REDIRECT_URI');
    expect((error as Error).message).not.toContain('private-secret');
    expect((error as Error).message).not.toContain('private-invalid-uri');
  }
});

test('Unrelated server errors stay redacted in v1 responses', async () => {
  const { errorHandler } = await import('../src/api/middlewares/errorHandler.js');
  const { AppError } = await import('../src/errors/AppError.js');
  let status = 0;
  let body: any;
  const response = {
    status(value: number) {
      status = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };
  errorHandler(
    new AppError('private internal failure', 503),
    { path: '/api/v1/test', url: '/api/v1/test' } as any,
    response as any,
    () => {},
  );
  expect(status).toBe(503);
  expect(body.message).toBe('Internal Server Error');
  expect(JSON.stringify(body)).not.toContain('private internal failure');
});
