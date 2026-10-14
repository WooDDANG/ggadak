import { test, expect } from 'vitest';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import { AppError } from '../src/errors/AppError.js';
import type { IAiAdapter } from '../src/adapters/ai.adapter.js';

const graph = {
  summary: '캐시 도입 제안',
  nodes: [
    { id: 'topic', type: 'Topic', summary: '로그인 성능' },
    { id: 'issue', type: 'Issue', summary: '어떤 캐시를 사용할까?' },
    {
      id: 'candidate',
      type: 'DecisionCandidate',
      summary: 'Redis 도입 검토',
      observation: 'proposed',
      rationaleStatus: 'not_stated',
      category: '기술',
      history: [{ observation: 'proposed', summary: 'Redis를 검토하자', at: null }],
    },
    { id: 'redis', type: 'Alternative', summary: 'Redis', observation: null },
  ],
  edges: [
    { id: 'e1', type: 'contains', sourceId: 'topic', targetId: 'issue' },
    { id: 'e2', type: 'contains', sourceId: 'issue', targetId: 'candidate' },
    { id: 'e3', type: 'has_alternative', sourceId: 'candidate', targetId: 'redis' },
  ],
  discussionProblems: [],
};

test('unagreed proposal without rationale is verified, persisted, and read as a guild-scoped graph', async () => {
  const db = await isolatedRepository();
  const calls: string[] = [];
  const server = await createServer(
    db.repo,
    {
      extractGraph: async () => {
        calls.push('extract');
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => {
        calls.push('verify');
        return { value: { valid: true, issues: [] } };
      },
      repairGraph: async () => {
        throw new Error('unexpected repair');
      },
    } as any,
    { ...fakeAuthOptions(), serviceToken: 'service' },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const send = () =>
      fetch(`${base}/api/discussions/analyze`, {
        method: 'POST',
        headers: { Authorization: 'Bearer service', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'proposal',
          guildId: 'guild-1',
          channelId: 'channel',
          isManualOverride: true,
          rawMessages: [
            {
              id: '101',
              author: 'Lee',
              content: 'Redis를 검토해보자',
              createdAt: '2026-10-14T00:00:00Z',
            },
          ],
        }),
      });
    const response = await send();
    expect(response.status).toBe(200);
    const result = (await response.json()) as any;
    expect(result.decisions[0]).toMatchObject({
      state: 'Draft',
      rationale: '',
      rationaleStatus: 'not_stated',
    });
    expect(calls).toEqual(['extract', 'verify']);
    expect(await (await send()).json()).toEqual(result);
    expect(calls).toEqual(['extract', 'verify']);
    const { token } = await loginAsTestUser(base);
    const snapshot = await fetch(
      `${base}/api/v1/analysis-requests/proposal/graph?guildId=guild-1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(snapshot.status).toBe(200);
    const data = ((await snapshot.json()) as any).data;
    expect(
      data.sessions[0].nodes.find((node: any) => node.type === 'DecisionCandidate'),
    ).toMatchObject({ decisionId: result.decisions[0].id, observation: 'proposed' });
    expect(
      (
        await fetch(`${base}/api/v1/analysis-requests/proposal/graph?guildId=guild-2`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
});

async function withApi(
  adapter: IAiAdapter,
  run: (
    base: string,
    send: (
      requestId: string,
      messages?: Array<{ id: string; author: string; content: string; createdAt: string }>,
    ) => Promise<Response>,
    token: string,
    restart: () => Promise<string>,
    db: Awaited<ReturnType<typeof isolatedRepository>>,
  ) => Promise<void>,
) {
  const db = await isolatedRepository();
  let server = await createServer(db.repo, adapter, {
    ...fakeAuthOptions(),
    serviceToken: 'service',
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let base = `http://127.0.0.1:${(server.address() as any).port}`;
  const send = (
    requestId: string,
    messages = [
      {
        id: '101',
        author: 'Lee',
        content: 'Redis를 검토해보자',
        createdAt: '2026-10-14T00:00:00Z',
      },
    ],
  ) =>
    fetch(`${base}/api/discussions/analyze`, {
      method: 'POST',
      headers: { Authorization: 'Bearer service', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        guildId: 'guild-1',
        channelId: 'channel',
        isManualOverride: true,
        rawMessages: messages,
      }),
    });
  const restart = async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.client.$disconnect();
    server = await createServer(db.repo, adapter, {
      ...fakeAuthOptions(),
      serviceToken: 'service',
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    return base;
  };
  try {
    const { token } = await loginAsTestUser(base);
    await run(base, send, token, restart, db);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.cleanup();
  }
}

test('meaning errors are repaired once and reverified before a candidate becomes visible', async () => {
  const calls: string[] = [];
  await withApi(
    {
      extractGraph: async () => {
        calls.push('extract');
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => {
        calls.push('verify');
        return {
          value:
            calls.filter(c => c === 'verify').length === 1
              ? {
                  valid: false,
                  issues: [{ message: 'Incorrect summary', nodeIds: ['candidate'], edgeIds: [] }],
                }
              : { valid: true, issues: [] },
        };
      },
      repairGraph: async () => {
        calls.push('repair');
        return { value: structuredClone(graph) };
      },
    },
    async (base, send, token) => {
      expect((await send('repair')).status).toBe(200);
      expect(calls).toEqual(['extract', 'verify', 'repair', 'verify']);
      const status = (
        (await (
          await fetch(`${base}/api/v1/analysis-requests/repair?guildId=guild-1`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()) as any
      ).data;
      expect(status.sessions[0]).toMatchObject({ repairs: 1, logicalCalls: 4, phase: 'done' });
    },
  );
});

test('structure repair consumes the same repair budget; remaining meaning error is terminal and never publishes', async () => {
  const calls: string[] = [];
  await withApi(
    {
      extractGraph: async () => {
        calls.push('extract');
        const broken = structuredClone(graph);
        broken.edges[0].targetId = 'absent';
        return { value: broken };
      },
      verifyGraph: async () => {
        calls.push('verify');
        return {
          value: {
            valid: false,
            issues: [{ message: 'Still inaccurate', nodeIds: [], edgeIds: [] }],
          },
        };
      },
      repairGraph: async () => {
        calls.push('repair');
        return { value: structuredClone(graph) };
      },
    },
    async (base, send, token) => {
      expect((await send('terminal')).status).toBe(422);
      expect((await send('terminal')).status).toBe(422);
      expect(calls).toEqual(['extract', 'repair', 'verify']);
      const headers = { Authorization: `Bearer ${token}` };
      const status = (
        (await (
          await fetch(`${base}/api/v1/analysis-requests/terminal?guildId=guild-1`, { headers })
        ).json()) as any
      ).data;
      expect(status).toMatchObject({ state: 'terminal', graphAvailable: false, retryable: false });
      expect(
        (
          await fetch(`${base}/api/v1/analysis-requests/terminal/graph?guildId=guild-1`, {
            headers,
          })
        ).status,
      ).toBe(422);
      const list = (
        (await (await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })).json()) as any
      ).data;
      expect(list.items).toEqual([]);
    },
  );
});

test('failed verification resumes without repeating extraction and does not reset stage budget', async () => {
  let extracts = 0,
    verifies = 0;
  await withApi(
    {
      extractGraph: async () => {
        extracts++;
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => {
        if (++verifies === 1) throw new AppError('temporary fixture', 503);
        return { value: { valid: true, issues: [] } };
      },
      repairGraph: async () => {
        throw new Error('unexpected');
      },
    },
    async (base, send, token, restart) => {
      expect((await send('resume')).status).toBe(503);
      base = await restart();
      expect((await send('resume')).status).toBe(200);
      expect(extracts).toBe(1);
      expect(verifies).toBe(2);
      const status = (
        (await (
          await fetch(`${base}/api/v1/analysis-requests/resume?guildId=guild-1`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()) as any
      ).data;
      expect(status.sessions[0]).toMatchObject({ logicalCalls: 2, attempts: 3, repairs: 0 });
    },
  );
});

test('all sessions commit together and completed sessions survive a later transient failure', async () => {
  let extracts = 0,
    verifies = 0;
  await withApi(
    {
      extractGraph: async () => {
        extracts++;
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => {
        if (++verifies === 2) throw new AppError('temporary', 503);
        return { value: { valid: true, issues: [] } };
      },
      repairGraph: async () => {
        throw new Error('unexpected');
      },
    },
    async (base, send, token, restart) => {
      const messages = [
        {
          id: '201',
          author: 'Lee',
          content: 'Redis 도입을 검토해보자',
          createdAt: '2026-10-14T00:00:00Z',
        },
        {
          id: '301',
          author: 'Kim',
          content: '별도 서버에도 Redis를 검토해보자',
          createdAt: '2026-10-14T02:00:00Z',
        },
      ];
      expect((await send('multi', messages)).status).toBe(503);
      const headers = { Authorization: `Bearer ${token}` };
      expect(
        (
          (await (
            await fetch(`${base}/api/v1/decisions?guildId=guild-1`, { headers })
          ).json()) as any
        ).data.items,
      ).toEqual([]);
      expect(
        (await fetch(`${base}/api/v1/analysis-requests/multi/graph?guildId=guild-1`, { headers }))
          .status,
      ).toBe(409);
      base = await restart();
      const response = await send('multi', messages);
      expect(response.status).toBe(200);
      expect(((await response.json()) as any).decisions).toHaveLength(2);
      expect(extracts).toBe(2);
      expect(verifies).toBe(3);
      const snapshot = (
        (await (
          await fetch(`${base}/api/v1/analysis-requests/multi/graph?guildId=guild-1`, { headers })
        ).json()) as any
      ).data;
      expect(snapshot.sessions).toHaveLength(2);
    },
  );
});

test('human edits preserve the original graph and multiple analyses retain actual card links', async () => {
  await withApi(
    {
      extractGraph: async () => ({ value: structuredClone(graph) }),
      verifyGraph: async () => ({ value: { valid: true, issues: [] } }),
      repairGraph: async () => {
        throw new Error('unexpected');
      },
    },
    async (base, send, token) => {
      const first = (await (await send('snapshot')).json()) as any;
      const decision = first.decisions[0];
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const edit = await fetch(`${base}/api/v1/decisions/${decision.id}?guildId=guild-1`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          expectedVersion: decision.version,
          title: '검수자 수정',
          decision: 'Redis를 테스트해보기',
          rationale: '',
          category: '기술',
          alternatives: [{ id: decision.alternatives[0].id, name: 'Redis', reason: '' }],
        }),
      });
      expect(edit.status).toBe(200);
      const second = (await (await send('snapshot-again')).json()) as any;
      expect(second.decisions[0].id).toBe(decision.id);
      const read = async () =>
        (
          (await (
            await fetch(`${base}/api/v1/analysis-requests/snapshot/graph?guildId=guild-1`, {
              headers,
            })
          ).json()) as any
        ).data;
      const old = (await read()).sessions[0].nodes.find(
        (node: any) => node.type === 'DecisionCandidate',
      );
      expect(old).toMatchObject({
        summary: 'Redis 도입 검토',
        decisionVersion: 1,
        currentDecisionVersion: 2,
        stale: true,
      });
      const history = (
        (await (
          await fetch(`${base}/api/v1/decisions/${decision.id}/history?guildId=guild-1`, {
            headers,
          })
        ).json()) as any
      ).data;
      expect(history).toHaveLength(2);
      expect(
        history.every((entry: any) => entry.graphAvailable && entry.candidateNodeIds.length === 1),
      ).toBe(true);
    },
  );
});

test('a problem-only context graph is verified and completes without manufacturing a candidate', async () => {
  let verifies = 0;
  await withApi(
    {
      extractGraph: async () => ({
        value: {
          summary: 'Unresolved issue',
          nodes: [{ id: 'problem', type: 'Issue', summary: 'Login is slow' }],
          edges: [],
          discussionProblems: [],
        },
      }),
      verifyGraph: async () => {
        verifies++;
        return { value: { valid: true, issues: [] } };
      },
      repairGraph: async () => {
        throw new Error('unexpected');
      },
    },
    async (base, send, token) => {
      const result = (await (
        await send('context', [
          {
            id: '102',
            author: 'Lee',
            content: '로그인이 느려요',
            createdAt: '2026-10-14T00:00:00Z',
          },
        ])
      ).json()) as any;
      expect(result).toMatchObject({ found: false, decisions: [] });
      expect(verifies).toBe(1);
      const snapshot = (
        (await (
          await fetch(`${base}/api/v1/analysis-requests/context/graph?guildId=guild-1`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json()) as any
      ).data;
      expect(snapshot.sessions[0].nodes[0]).toMatchObject({
        type: 'Issue',
        summary: 'Login is slow',
      });
    },
  );
});

test('final critic issues and failed attempt diagnostics survive terminal replay', async () => {
  let verifications = 0;
  const issues = (message: string) => ({
    valid: false,
    issues: [{ message, nodeIds: ['candidate'], edgeIds: ['e2'] }],
  });
  await withApi(
    {
      extractGraph: async () => ({ value: structuredClone(graph) }),
      repairGraph: async () => ({ value: structuredClone(graph) }),
      verifyGraph: async () => ({
        value: issues(
          ++verifications === 1 ? 'Agreement is inaccurate' : 'Rationale is outside the input',
        ),
      }),
    },
    async (_base, send, _token, _restart, db) => {
      expect((await send('critic-diagnostics')).status).toBe(422);
      expect((await send('critic-diagnostics')).status).toBe(422);
      const row = await db.client.analysisRequest.findUniqueOrThrow({
        where: { id: 'critic-diagnostics' },
      });
      const workflow = JSON.parse(row.workflowJson!);
      const session = workflow.sessions[0];
      expect(session.feedback).toEqual(['Rationale is outside the input']);
      const attempt = session.attempts.at(-1);
      expect(attempt).toMatchObject({
        phase: 'reverify',
        outcome: 'failed',
        verification: issues('Rationale is outside the input'),
        error: { status: 422 },
      });
      expect(attempt.owner).toEqual(expect.any(String));
      expect(attempt.deadline).toBe(attempt.startedAt + attempt.timeoutMs);
      expect(session.verification).toEqual(issues('Rationale is outside the input'));
      expect(verifications).toBe(2);
    },
  );
});
