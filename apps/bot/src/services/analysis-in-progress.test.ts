import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendApiService, AnalysisDeliveryError } from './backend-api.service.js';

// Public delivery/restart seam: a timed-out HTTP connection does not mean BE stopped inference.
test('a long analysis survives repeated in-progress replies and Bot restarts without exhausting delivery retries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'analysis-in-progress-'));
  let now = 1000;
  let replies = 0;
  let completed = false;
  const transport: typeof fetch = async () => {
    replies++;
    if (replies === 1) throw new Error('Analysis request timeout');
    return completed
      ? Response.json({ found: true, decisions: [{ id: 'candidate' }] })
      : Response.json(
          { error: 'Analysis is already in progress; retry this request' },
          { status: 503 },
        );
  };
  const restarted = () =>
    new BackendApiService('http://fixture', directory, transport, () => now, 'service', {
      maxAttempts: 2,
      initialDelayMs: 5,
      maxDelayMs: 20,
      timeoutMs: 1000,
      jitter: 0,
    });
  try {
    await assert.rejects(
      restarted().analyzeDiscussion({
        requestId: 'long-analysis',
        channelId: 'channel',
        rawMessages: [],
      }),
      (error: AnalysisDeliveryError) => error.outcome === 'retry-pending',
    );
    for (let i = 0; i < 4; i++) {
      now += 100;
      assert.deepEqual(await restarted().retryPendingAnalyses(), []);
    }
    completed = true;
    now += 100;
    const results = await restarted().retryPendingAnalyses();
    assert.equal(results.length, 1);
    assert.equal(results[0].payload.requestId, 'long-analysis');
    assert.deepEqual(results[0].result.decisions, [{ id: 'candidate' }]);
    now += 100;
    assert.deepEqual(await restarted().retryPendingAnalyses(), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
