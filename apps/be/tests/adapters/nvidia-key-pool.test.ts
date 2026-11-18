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

test('두 BE 연결이 네 계정의 예산을 공유하고 재시작 후에도 제한을 유지한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const second = new PrismaClient({ datasources: { db: { url: db.url + '?connection_limit=1' } } });
  cleanups.unshift(() => second.$disconnect());
  const credentials = nvidiaCredentials(
    Object.fromEntries([1, 2, 3, 4].map(n => [`NVIDIA_API_KEY_${n}`, `secret-${n}`])),
  );
  let now = 1_000_000;
  const pools = [db.client, second].map(
    client => new NvidiaKeyPool(client, credentials, 40, () => now),
  );
  const signal = new AbortController().signal;
  const selected = await Promise.all([0, 1, 0, 1].map(n => pools[n].reserve(signal)));
  expect(new Set(selected.map(key => key.name)).size).toBe(4);
  await expect(
    new NvidiaKeyPool(second, credentials, 40, () => now).reserve(signal),
  ).rejects.toMatchObject({ details: { retryAfterMs: 1500 } });
  now += 1499;
  await expect(pools[0].reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 1 } });
  now++;
  await expect(pools[0].reserve(signal)).resolves.toMatchObject({ name: expect.any(String) });
  const rows = await db.client.$queryRawUnsafe('SELECT "id" FROM "NvidiaAccountBudget"');
  expect(JSON.stringify(rows)).not.toContain('secret-');
});

test('429 대기와 인증 실패는 해당 키에만 적용하고 키 교체로 복구한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const keys = nvidiaCredentials({ NVIDIA_API_KEY_1: 'first', NVIDIA_API_KEY_2: 'second' });
  let now = 1_000_000;
  const pool = new NvidiaKeyPool(db.client, keys, 40, () => now);
  const signal = new AbortController().signal;
  const first = await pool.reserve(signal);
  await pool.recordFailure(first, 429, 10_000);
  const second = await pool.reserve(signal);
  expect(second.name).not.toBe(first.name);
  await pool.recordFailure(second, 401);
  now += 9999;
  await expect(pool.reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 1 } });
  now++;
  expect((await new NvidiaKeyPool(db.client, keys, 40, () => now).reserve(signal)).name).toBe(
    first.name,
  );
  await pool.recordFailure(first, 403);
  await expect(pool.reserve(signal)).rejects.toMatchObject({ statusCode: 401 });
  const replaced = new NvidiaKeyPool(db.client, [{ name: first.name, apiKey: 'replacement' }]);
  await expect(replaced.reserve(signal)).resolves.toMatchObject({ apiKey: 'replacement' });
});

test('취소된 호출은 예산을 예약하지 않는다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  const pool = new NvidiaKeyPool(db.client, [{ name: 'single', apiKey: 'secret' }]);
  const controller = new AbortController();
  controller.abort();
  await expect(pool.reserve(controller.signal)).rejects.toMatchObject({ statusCode: 503 });
  await expect(pool.reserve(new AbortController().signal)).resolves.toMatchObject({
    name: 'single',
  });
});

test('분 경계에서 예산이 초기화되지 않고 임의의 60초에 40회만 예약한다', async () => {
  const db = await isolatedRepository();
  cleanups.push(db.cleanup);
  let now = 59999;
  const pool = new NvidiaKeyPool(db.client, [{ name: 'single', apiKey: 'secret' }], 40, () => now);
  const signal = new AbortController().signal;
  await pool.reserve(signal);
  now = 60000;
  await expect(pool.reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 1499 } });
  for (let i = 1; i < 40; i++) {
    now = 59999 + i * 1500;
    await pool.reserve(signal);
  }
  now = 119998;
  await expect(pool.reserve(signal)).rejects.toMatchObject({ details: { retryAfterMs: 1 } });
  now++;
  await expect(pool.reserve(signal)).resolves.toMatchObject({ name: 'single' });
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
