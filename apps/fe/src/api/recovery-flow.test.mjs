import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

test('recovery UI disables stale control, observes retry acknowledgements, and reloads a conflicted review without resubmitting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ggaddak-recovery-ui-'));
  const outfile = join(dir, 'flow.mjs');
  await build({
    stdin: {
      contents: `
 export {recoveryApi} from './api/recovery.api';
 export {decisionsApi} from './api/decisions.api';
 export {reviewWithConflictReload} from './api/review-workflow';
 export {AnalysisRecovery} from './features/review-queue/AnalysisRecovery';
 export {CandidateHistory} from './features/review-queue/CandidateHistory';
 export {QueryClient,QueryClientProvider} from '@tanstack/react-query';
 export {renderToString} from 'react-dom/server';
 export {createElement} from 'react';
 `,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    banner: {
      js: "import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);",
    },
    outfile,
  });
  const flow = await import(pathToFileURL(outfile));
  const previous = globalThis.fetch;
  const requests = [];
  const queue = {
    requests: [
      {
        requestId: 'failed',
        guildId: 'guild',
        channelId: 'channel',
        status: 'retained-failure',
        attempts: 5,
        errorCategory: 'network-or-timeout',
        nextAttemptAt: 0,
        synchronizedAt: new Date().toISOString(),
      },
    ],
    available: false,
    lastSynchronizedAt: new Date().toISOString(),
  };
  const client = new flow.QueryClient({ defaultOptions: { queries: { retry: false } } });
  let acknowledge = false;
  let reloads = 0;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/review?'))
      return Response.json({ success: false, message: 'Stale decision version' }, { status: 409 });
    if (url.includes('/retry?'))
      return Response.json(
        {
          success: true,
          data: {
            id: 'command',
            requestId: 'failed',
            guildId: 'guild',
            createdAt: new Date().toISOString(),
            acknowledgedAt: acknowledge ? new Date().toISOString() : null,
          },
        },
        { status: 202 },
      );
    if (url.includes('/history?'))
      return Response.json({
        success: true,
        data: [
          {
            requestId: 'analysis',
            isManualOverride: true,
            previousRequestIds: ['earlier'],
            relatedCandidateIds: ['rejected'],
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      });
    return Response.json({ success: true, data: queue });
  };
  try {
    assert.equal((await flow.recoveryApi.list('guild')).available, false);
    client.setQueryData(['analysis-deliveries', 'guild'], queue);
    const html = flow.renderToString(
      flow.createElement(
        flow.QueryClientProvider,
        { client },
        flow.createElement(flow.AnalysisRecovery, { guildId: 'guild' }),
      ),
    );
    assert.match(html, /최신 상태를 확인할 수 없습니다/);
    assert.match(html, /disabled/);
    assert.match(html.replace(/<!--.*?-->/g, ''), /시도 5회/);
    assert.match(html, /시간 초과/);
    const first = await flow.recoveryApi.retry('guild', 'failed', 'command');
    assert.equal(first.acknowledgedAt, null);
    acknowledge = true;
    const next = await flow.recoveryApi.retry('guild', 'failed', 'command');
    assert.ok(next.acknowledgedAt);
    const retries = requests.filter(r => r.url.includes('/retry?'));
    assert.deepEqual(
      retries.map(r => JSON.parse(r.options.body).commandId),
      ['command', 'command'],
    );
    await assert.rejects(
      flow.reviewWithConflictReload(
        () =>
          flow.decisionsApi.reviewDecision(
            'candidate',
            { action: 'confirm', expectedVersion: 1, resolution: 'independent' },
            'guild',
          ),
        async () => {
          reloads++;
        },
      ),
      /다시 검토/,
    );
    assert.equal(reloads, 1);
    assert.equal(requests.filter(r => r.url.includes('/review?')).length, 1);
    client.setQueryData(['candidate-history', 'guild', 'candidate'], {
      analyses: [
        {
          requestId: 'analysis',
          isManualOverride: true,
          previousRequestIds: ['earlier'],
          relatedCandidateIds: ['rejected'],
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      related: [
        {
          id: 'rejected',
          title: 'Earlier candidate',
          state: 'Rejected',
          decision: 'Earlier proposal',
          rationale: 'Earlier reason',
          actionItems: [],
        },
      ],
    });
    const history = flow.renderToString(
      flow.createElement(
        flow.QueryClientProvider,
        { client },
        flow.createElement(flow.CandidateHistory, { guildId: 'guild', decisionId: 'candidate' }),
      ),
    );
    assert.match(history, /수동 재분석/);
    assert.match(history, /반려/);
    assert.match(history, /Earlier proposal/);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(flow.recoveryApi.retry('guild', 'failed', 'command'), /offline/);
  } finally {
    client.clear();
    globalThis.fetch = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
