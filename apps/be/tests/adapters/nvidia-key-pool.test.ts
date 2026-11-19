import { afterEach, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isolatedRepository } from '../../src/repositories/test-database.js';
import { NvidiaKeyPool } from '../../src/adapters/nvidia-key-pool.js';
import { nvidiaCredentials } from '../../src/config/nvidia-credentials.js';
import { NvidiaProvider } from '../../src/adapters/nvidia-provider.js';
import type OpenAI from 'openai';
import { GraphSchema } from '../../src/domain/decision-graph.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

test('번호 키를 우선하고 빈 값과 중복을 제거하며 단일 키를 지원한다', () => {
  expect(nvidiaCredentials({ NVIDIA_API_KEY: 'legacy' })).toEqual([
    { name: 'NVIDIA_API_KEY', apiKey: 'legacy' },
  ]);
  expect(
    nvidiaCredentials({
      NVIDIA_API_KEY: 'legacy',
      NVIDIA_API_KEY_1: ' a ',
      NVIDIA_API_KEY_2: '',
      NVIDIA_API_KEY_3: 'a',
      NVIDIA_API_KEY_4: 'b',
    }),
  ).toEqual([
    { name: 'NVIDIA_API_KEY_1', apiKey: 'a' },
    { name: 'NVIDIA_API_KEY_4', apiKey: 'b' },
  ]);
});

test('두 BE 연결은 사용 중인 키를 중복 배정하지 않고 해제 후 재사용한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const second = new PrismaClient({ datasources: { db: { url: db.url + '?connection_limit=1' } } });
  cleanups.unshift(() => second.$disconnect());
  let now = 1_000_000;
  const keys = nvidiaCredentials({ NVIDIA_API_KEY_1: 'first', NVIDIA_API_KEY_2: 'second' });
  const pools = [db.client, second].map(client => new NvidiaKeyPool(client, keys, 2, () => now));
  const signal = new AbortController().signal;
  const first = await pools[0].reserve(signal);
  const next = await pools[1].reserve(signal);
  expect(first.name).not.toBe(next.name);
  await expect(pools[0].reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 500 } });
  await first.release();
  const reused = await pools[1].reserve(signal);
  expect(reused.name).toBe(first.name);
  await reused.release();
  await next.release();
  const other = await pools[0].reserve(signal);
  expect(other.name).toBe(next.name);
  await other.release();
  await expect(pools[0].reserve(signal)).rejects.toMatchObject({
    details: { retryAfterMs: 60000 },
  });
  now += 60_000;
  const afterWindow = await pools[0].reserve(signal);
  await afterWindow.release();
});

test('두 연결이 동시에 요청하면 동일한 키의 잠금은 하나만 발급된다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const second = new PrismaClient({ datasources: { db: { url: db.url + '?connection_limit=1' } } });
  cleanups.unshift(() => second.$disconnect());
  const keys = [{ name: 'single', apiKey: 'secret' }];
  const signal = new AbortController().signal;
  const outcomes = await Promise.allSettled([
    new NvidiaKeyPool(db.client, keys).reserve(signal),
    new NvidiaKeyPool(second, keys).reserve(signal),
  ]);
  const success = outcomes.filter(result => result.status === 'fulfilled');
  expect(success).toHaveLength(1);
  const rejected = outcomes.filter(result => result.status === 'rejected');
  expect(rejected).toHaveLength(1);
  if (rejected[0].status === 'rejected')
    expect(rejected[0].reason).toMatchObject({ statusCode: 503, details: { retryAfterMs: 500 } });
  if (success[0].status === 'fulfilled') await success[0].value.release();
});

test('429과 인증 실패는 해당 키에만 적용하고 만료된 잠금의 이전 소유자는 새 잠금을 해제하지 못한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = 1_000_000;
  const keys = nvidiaCredentials({ NVIDIA_API_KEY_1: 'first', NVIDIA_API_KEY_2: 'second' });
  const pool = new NvidiaKeyPool(db.client, keys, 40, () => now);
  const signal = new AbortController().signal;
  const first = await pool.reserve(signal);
  await pool.recordFailure(first, 429, 10_000);
  await first.release();
  const second = await pool.reserve(signal);
  await pool.recordFailure(second, 401);
  await second.release();
  now += 10_000;
  const old = await pool.reserve(signal);
  now += 60_001;
  const replacement = await pool.reserve(signal);
  await pool.recordFailure(old, 401);
  await old.release();
  await expect(pool.reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 500 } });
  await replacement.release();
  const available = await pool.reserve(signal);
  await pool.recordFailure(available, 401);
  await available.release();
  await expect(pool.reserve(signal)).rejects.toMatchObject({ statusCode: 401 });
});

test('403은 키를 1시간 쉬게 한 뒤 다시 쓰고, 401은 영구히 끈다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = 1_000_000;
  const keys = nvidiaCredentials({ NVIDIA_API_KEY_1: 'first', NVIDIA_API_KEY_2: 'second' });
  const pool = new NvidiaKeyPool(db.client, keys, 40, () => now);
  const signal = new AbortController().signal;
  const forbidden = await pool.reserve(signal);
  await pool.recordFailure(forbidden, 403);
  await forbidden.release();
  const revoked = await pool.reserve(signal);
  expect(revoked.name).not.toBe(forbidden.name);
  await pool.recordFailure(revoked, 401);
  await revoked.release();
  // 남은 키가 쉬는 동안은 인증 실패가 아니라 대기다.
  await expect(pool.reserve(signal)).rejects.not.toMatchObject({ statusCode: 401 });
  now += 60 * 60 * 1000;
  const restored = await pool.reserve(signal);
  expect(restored.name).toBe(forbidden.name);
  await restored.release();
});

test('취소된 호출은 예산을 예약하지 않는다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const pool = new NvidiaKeyPool(db.client, [{ name: 'single', apiKey: 'secret' }]);
  const controller = new AbortController();
  controller.abort();
  await expect(pool.reserve(controller.signal)).rejects.toMatchObject({ statusCode: 503 });
  const reservation = await pool.reserve(new AbortController().signal);
  await reservation.release();
});

test('Provider가 네 키를 모두 사용하고 429 요청을 SDK에서 재시도하지 않는다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const keys = [1, 2, 3, 4].map(n => ({ name: `NVIDIA_API_KEY_${n}`, apiKey: `secret-${n}` }));
  const used: string[] = [];
  let limited = true;
  const provider = new NvidiaProvider({
    keyPool: new NvidiaKeyPool(db.client, keys),
    clientFactory: apiKey =>
      ({
        chat: {
          completions: {
            create: async (_: unknown, options: { maxRetries: number }) => {
              expect(options.maxRetries).toBe(0);
              used.push(apiKey);
              if (limited) {
                limited = false;
                throw {
                  status: 429,
                  headers: { 'retry-after': '30' },
                  message: `Bearer ${apiKey}`,
                };
              }
              return (async function* () {
                yield { choices: [{ delta: { content: '{}' } }] };
              })();
            },
          },
        },
      }) as unknown as OpenAI,
  });
  const request = {
    model: 'fixture',
    system: '',
    input: '',
    outputSchema: GraphSchema,
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
  const failure = await provider.generate(request).catch(error => error);
  expect(failure.statusCode).toBe(429);
  expect(JSON.stringify(failure)).not.toContain('secret-');
  expect(used).toHaveLength(1);
  for (let i = 0; i < 3; i++) await provider.generate(request);
  expect(new Set(used).size).toBe(4);
});

test('Provider 응답을 기다리는 동안 같은 키를 막고 실패 후에는 다시 사용한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => {
    entered = resolve;
  });
  const gate = new Promise<void>(resolve => {
    finish = resolve;
  });
  let count = 0;
  const provider = new NvidiaProvider({
    keyPool: new NvidiaKeyPool(db.client, [{ name: 'one', apiKey: 'secret' }]),
    clientFactory: () =>
      ({
        chat: {
          completions: {
            create: async () => {
              if (++count === 1) {
                entered();
                await gate;
                throw { status: 503 };
              }
              return (async function* () {
                yield { choices: [{ delta: { content: '{}' } }] };
              })();
            },
          },
        },
      }) as unknown as OpenAI,
  });
  const request = {
    model: 'fixture',
    system: '',
    input: '',
    outputSchema: GraphSchema,
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
  try {
    const pending = provider.generate(request);
    await started;
    await expect(provider.generate(request)).rejects.toMatchObject({
      details: { retryAfterMs: 500 },
    });
    finish();
    await expect(pending).rejects.toMatchObject({ statusCode: 503 });
    await expect(provider.generate(request)).resolves.toMatchObject({ value: {} });
    expect(count).toBe(2);
  } finally {
    finish();
  }
});

test('모든 키가 403으로 쉬면 대기가 아니라 인증 장애로 알린다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = 1_000_000;
  const keys = nvidiaCredentials({ NVIDIA_API_KEY_1: 'first', NVIDIA_API_KEY_2: 'second' });
  const pool = new NvidiaKeyPool(db.client, keys, 40, () => now);
  const signal = new AbortController().signal;
  const first = await pool.reserve(signal);
  await pool.recordFailure(first, 403);
  await first.release();
  const second = await pool.reserve(signal);
  await pool.recordFailure(second, 429, 10_000);
  await second.release();
  // 한 키라도 429로 쉬는 중이면 기다리면 풀리므로 대기다.
  await expect(pool.reserve(signal)).rejects.toMatchObject({
    statusCode: 503,
    details: { retryAfterMs: 10_000 },
  });
  now += 10_000;
  const again = await pool.reserve(signal);
  await pool.recordFailure(again, 403);
  await again.release();
  await expect(pool.reserve(signal)).rejects.toMatchObject({
    statusCode: 403,
    details: { failureKind: 'auth' },
  });
});
