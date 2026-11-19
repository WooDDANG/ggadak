import { test, expect, vi } from 'vitest';
import winston from 'winston';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiAdapter } from '../src/adapters/ai.adapter.js';
import { VerificationSchema } from '../src/domain/decision-graph.js';
import { createServer } from '../src/server.js';
import { isolatedRepository } from '../src/repositories/test-database.js';
import { fakeAuthOptions, loginAsTestUser } from '../src/test-support/auth.js';
import { AnalysisRequestRepository } from '../src/repositories/analysis-request.repository.js';
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

test('파생 그래프 불일치는 repair 호출 없이 정규화하고 후보를 발행한다', async () => {
  const calls: string[] = [];
  const input = structuredClone(graph);
  input.nodes.push({
    id: 'second',
    type: 'DecisionCandidate',
    summary: '대안',
    observation: 'proposed',
    rationaleStatus: 'stated',
    category: '기술',
    history: [{ observation: 'proposed', summary: '대안 검토', at: null }],
  } as any);
  input.edges.push(
    { id: 'conflict1', type: 'conflicts_with', sourceId: 'candidate', targetId: 'second' },
    { id: 'conflict2', type: 'conflicts_with', sourceId: 'second', targetId: 'candidate' },
  );
  input.discussionProblems.push({
    summary: '검토',
    nodeIds: ['candidate', 'missing'],
    edgeIds: ['conflict2', 'missing'],
  } as never);
  await withApi(
    {
      extractGraph: async () => ({ value: input }),
      verifyGraph: async (_transcript, normalized) => {
        calls.push('verify');
        expect(normalized).toMatchObject({
          discussionProblems: [{ nodeIds: ['candidate'], edgeIds: ['conflict1'] }],
        });
        return { value: { valid: true, issues: [] } };
      },
      repairGraph: async () => {
        calls.push('repair');
        throw new Error('unexpected repair');
      },
    },
    async (_base, send) => {
      const response = await send('normalize-derived');
      expect(response.status).toBe(200);
      expect(((await response.json()) as any).decisions.length).toBeGreaterThan(0);
      expect(calls).toEqual(['verify']);
    },
  );
});

test('관계의 참조 ID 앞뒤 공백은 노드 ID처럼 정리해 복구 없이 발행한다', async () => {
  const input = structuredClone(graph);
  input.nodes[0].id = ' topic ';
  input.edges[0].sourceId = 'topic ';
  input.edges[1].targetId = ' candidate';
  let repaired = false;
  await withApi(
    {
      extractGraph: async () => ({ value: input }),
      repairGraph: async () => {
        repaired = true;
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => ({ value: { valid: true, issues: [] } }),
    },
    async (base, send, token) => {
      expect((await send('trimmed-references')).status).toBe(200);
      expect(repaired).toBe(false);
      const status = await fetch(
        `${base}/api/v1/analysis-requests/trimmed-references?guildId=guild-1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // 공백 때문에 관계가 제거돼 손상으로 기록되면 안 된다.
      expect(((await status.json()) as any).data.sessions[0].damageCount ?? 0).toBe(0);
    },
  );
});

test('잘못된 관계 복구에 실제 타입과 허용 조합을 제공한다', async () => {
  const input = structuredClone(graph);
  input.nodes.push({ id: 'reason', type: 'Rationale', summary: '비용 절감' });
  input.edges.push({ id: 'bad', type: 'contains', sourceId: 'topic', targetId: 'reason' });
  let feedback: string[] = [];
  await withApi(
    {
      extractGraph: async () => ({ value: input }),
      repairGraph: async (_transcript, _value, issues) => {
        feedback = issues;
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => ({ value: { valid: true, issues: [] } }),
    },
    async (_base, send) => {
      expect((await send('repair-hints')).status).toBe(200);
      expect(feedback.join(' ')).toContain('Topic');
      expect(feedback.join(' ')).toContain('Rationale');
      expect(feedback.join(' ')).toContain('Unlinked node: reason');
    },
  );
});

test('구조 복구 후 의미 검증 오류도 별도로 복구한다', async () => {
  const input = structuredClone(graph);
  input.nodes.push({ id: 'reason', type: 'Rationale', summary: '비용 절감' });
  input.edges.push({ id: 'bad', type: 'contains', sourceId: 'topic', targetId: 'reason' });
  let repairs = 0,
    verifies = 0;
  await withApi(
    {
      extractGraph: async () => ({ value: input }),
      repairGraph: async () => {
        repairs++;
        return { value: structuredClone(graph) };
      },
      verifyGraph: async () => ({
        value:
          ++verifies === 1
            ? { valid: false, issues: [{ message: '의미 수정', nodeIds: [], edgeIds: [] }] }
            : { valid: true, issues: [] },
      }),
    },
    async (base, send, token) => {
      expect((await send('two-repairs')).status).toBe(200);
      expect(repairs).toBe(2);
      expect(verifies).toBe(2);
      const status = await fetch(`${base}/api/v1/analysis-requests/two-repairs?guildId=guild-1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(((await status.json()) as any).data.sessions[0]).toMatchObject({
        repairs: 2,
        logicalCalls: 5,
      });
    },
  );
});

test.each(['structure', 'semantic'] as const)(
  '%s 검증 종료 로그는 실패 코드만 남기고 모델 출력 원문은 DB에만 둔다',
  async kind => {
    const marker = 'private-output-for-validation-test';
    const invalidGraph = {
      ...structuredClone(graph),
      summary: marker,
      nodes: [...graph.nodes, { id: 'reason', type: 'Rationale', summary: '비용 절감' }],
      edges: [
        ...graph.edges,
        { id: 'invalid', type: 'supports', sourceId: 'topic', targetId: 'candidate' },
      ],
    };
    const output = vi.spyOn(winston.transports.Console.prototype, 'log');
    try {
      await withApi(
        {
          extractGraph: async () => ({ value: kind === 'structure' ? invalidGraph : graph }),
          repairGraph: async () => ({ value: kind === 'structure' ? invalidGraph : graph }),
          verifyGraph: async () => ({
            value: { valid: false, issues: [{ message: marker, nodeIds: [], edgeIds: [] }] },
          }),
        },
        async (_base, send, _token, _restart, db) => {
          const requestId = `validation-log-${kind}`;
          expect((await send(requestId)).status).toBe(422);
          const logs = output.mock.calls.map(([info]) => JSON.stringify(info)).join('\n');
          const terminal = logs
            .split('\n')
            .find(line => line.includes('analysis.validation.failed') && line.includes(requestId));
          expect(terminal).toBeDefined();
          // ADR-0027: Loki로 가는 로그에는 대화와 모델 출력 원문을 복제하지 않는다.
          expect(logs).not.toContain(marker);
          expect(terminal).toContain(kind === 'structure' ? 'recheck' : 'reverify');
          expect(terminal).toContain(
            kind === 'structure' ? 'unlinked-node' : 'semantic-verification',
          );
          expect(terminal).toContain(kind === 'structure' ? '"issuesCount":2' : '"issuesCount":1');
          const row = await new AnalysisRequestRepository(db.repo).get(requestId);
          expect(row?.workflowJson).toContain(marker);
        },
      );
    } finally {
      output.mockRestore();
    }
  },
);

test('형식을 어긴 검증 응답은 코드로만 로그에 남긴다', async () => {
  const output = vi.spyOn(winston.transports.Console.prototype, 'log');
  try {
    await withApi(
      {
        extractGraph: async () => ({ value: structuredClone(graph) }),
        repairGraph: async () => ({ value: structuredClone(graph) }),
        verifyGraph: async () => ({
          value: { valid: 'wrong-type', issues: [], token: 'secret-test-token' },
        }),
      },
      async (_base, send) => {
        expect((await send('invalid-verification-output')).status).toBe(422);
        const logs = output.mock.calls.map(([info]) => JSON.stringify(info)).join('\n');
        expect(logs).toContain('analysis.verification.schema');
        expect(logs).toContain('"outcome":"invalid"');
        expect(logs).toContain('"failureKind":"verify-format"');
        expect(logs).not.toContain('wrong-type');
        expect(logs).not.toContain('secret-test-token');
      },
    );
  } finally {
    output.mockRestore();
  }
});

test('Provider 호출 성공과 Verify 스키마 실패를 같은 callId로 별도 기록한다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-metrics-'));
  const calls = path.join(dir, 'calls.jsonl');
  const validations = path.join(dir, 'validations.jsonl');
  const oldCalls = process.env.AI_METRICS_LOG_PATH;
  const oldValidations = process.env.AI_VERIFICATION_METRICS_LOG_PATH;
  process.env.AI_METRICS_LOG_PATH = calls;
  process.env.AI_VERIFICATION_METRICS_LOG_PATH = validations;
  try {
    const adapter = new AiAdapter({ provider: 'nvidia' }, 'production', {
      generate: async request => ({
        value:
          request.outputSchema === VerificationSchema
            ? { valid: 'invalid', issues: [] }
            : structuredClone(graph),
      }),
    });
    await withApi(adapter, async (_base, send) => {
      expect((await send('correlated-metrics')).status).toBe(422);
      const callRecords = fs
        .readFileSync(calls, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      const verification = JSON.parse(fs.readFileSync(validations, 'utf8').trim());
      const verifyCall = callRecords.find(record => record.stage === 'verify');
      expect(verifyCall).toMatchObject({ requestId: 'correlated-metrics', success: true });
      expect(verification).toMatchObject({
        requestId: 'correlated-metrics',
        callId: verifyCall.callId,
        outcome: 'invalid',
      });
    });
  } finally {
    if (oldCalls === undefined) delete process.env.AI_METRICS_LOG_PATH;
    else process.env.AI_METRICS_LOG_PATH = oldCalls;
    if (oldValidations === undefined) delete process.env.AI_VERIFICATION_METRICS_LOG_PATH;
    else process.env.AI_VERIFICATION_METRICS_LOG_PATH = oldValidations;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

test('의미 복구 이후에도 검증이 실패하면 터미널 상태로 남고 발행하지 않는다', async () => {
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
      expect(calls).toEqual(['extract', 'verify', 'repair', 'verify']);
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
      const row = (await new AnalysisRequestRepository(db.repo).get('critic-diagnostics'))!;
      const workflow = JSON.parse(row.workflowJson!);
      const session = workflow.sessions[0];
      expect(session.feedback).toEqual([
        'Rationale is outside the input | nodes: candidate | edges: e2',
      ]);
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
