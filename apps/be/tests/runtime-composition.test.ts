import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('fresh compiled server resolves Sync Job workers without test metadata preloading', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    // Load the real server first: test setup must not initialize its decorators.
    const { createApp } = await import('./apps/be/dist/server.js');
    const { isolatedRepository } = await import('./apps/be/dist/repositories/test-database.js');
    const { SyncJobService } = await import('./apps/be/dist/services/sync-job.service.js');
    const { createServer } = await import('node:http');
    const db = await isolatedRepository();
    let server;
    try {
      const app = await createApp(db.repo, undefined, { serviceToken: 'runtime-fixture' });
      server = createServer(app);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/internal/sync-jobs';
      const headers = { Authorization: 'Bearer runtime-fixture', 'Content-Type': 'application/json' };
      const claim = () => fetch(base + '/claim', { method: 'POST', headers, body: '{}' });
      for (let i = 0; i < 2; i++) {
        const response = await claim();
        assert.equal(response.status, 200, 'empty async worker claim must not fail');
        assert.equal((await response.json()).data, null);
      }
      assert.equal((await fetch(base + '/claim', { method: 'POST' })).status, 401);
      await db.client.guild.create({ data: { id: 'g', name: 'Runtime' } });
      await db.client.monitoredChannel.create({ data: { id: 'c', guildId: 'g', name: 'Channel' } });
      const job = await new SyncJobService(db.repo).create('g', false);
      const responses = await Promise.all([claim(), claim()]);
      for (const response of responses) assert.equal(response.status, 200);
      const claims = (await Promise.all(responses.map(r => r.json()))).map(r => r.data).filter(Boolean);
      assert.equal(claims.length, 1);
      assert.equal(claims[0].jobId, job.jobId);
      assert.equal(claims[0].deliveryOnly, true);
      console.log('RUNTIME_SYNC_CLAIM_PASS');
    } finally {
      if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
      await db.cleanup();
    }
  `,
    ],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development', AI_PROVIDER: 'mock' },
      encoding: 'utf8',
      timeout: 20000,
    },
  );
  expect(result.status, (result.stdout + result.stderr).slice(-4000)).toBe(0);
  expect(result.stdout).toContain('RUNTIME_SYNC_CLAIM_PASS');
}, 30000);
