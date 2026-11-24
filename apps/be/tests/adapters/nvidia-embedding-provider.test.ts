import { test, expect, vi } from 'vitest';
import { NvidiaEmbeddingProvider } from '../../src/adapters/nvidia-embedding-provider.js';
import {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from '../../src/services/search.service.js';
import { AppError } from '../../src/errors/AppError.js';
import { AnalysisBusyError } from '../../src/errors/analysis-error.js';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@ggaddak/shared', async importOriginal => {
  const shared = await importOriginal<typeof import('@ggaddak/shared')>();
  return {
    ...shared,
    createLogger: (name: string) =>
      name === 'BE-NVIDIA-EMBEDDING' ? { warn } : shared.createLogger(name),
  };
});

const reservation = () => {
  const released: string[] = [];
  return {
    released,
    reserve: async () => ({ apiKey: 'key-2', release: async () => void released.push('key-2') }),
  };
};

test('NVIDIA 임베딩은 키 풀에서 키를 빌려 질문과 문서를 구분해 요청하고, 입력 순서대로 벡터를 돌려준다', async () => {
  const keys = reservation();
  const bodies: any[] = [];
  const headers: string[] = [];
  const provider = new NvidiaEmbeddingProvider({
    baseURL: 'https://example.test/v1/',
    reserve: keys.reserve,
    fetch: async (url, init) => {
      expect(url).toBe('https://example.test/v1/embeddings');
      bodies.push(JSON.parse(String(init!.body)));
      headers.push(new Headers(init!.headers).get('authorization')!);
      return Response.json({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      });
    },
  });
  expect(provider.model).toBe('nvidia/nemotron-3-embed-1b');
  expect(await provider.embedBatch(['문서 A', '문서 B'], 'passage')).toEqual([
    [1, 0],
    [0, 1],
  ]);
  expect(bodies[0]).toMatchObject({
    model: 'nvidia/nemotron-3-embed-1b',
    input: ['문서 A', '문서 B'],
    input_type: 'passage',
  });
  expect(headers[0]).toBe('Bearer key-2');
  expect(keys.released).toEqual(['key-2']);
});

test('NVIDIA 임베딩 실패와 키 풀 사용 중 상태를 503으로 알린다', async () => {
  const keys = reservation();
  const failing = new NvidiaEmbeddingProvider({
    reserve: keys.reserve,
    fetch: async () => new Response('{}', { status: 500 }),
  });
  await expect(failing.embed('질문', 'query')).rejects.toMatchObject({ statusCode: 503 });
  expect(keys.released).toEqual(['key-2']);
  const busy = new NvidiaEmbeddingProvider({
    reserve: async () => {
      throw new AnalysisBusyError('NVIDIA account budgets are waiting', 500);
    },
    fetch: async () => {
      throw new Error('must not call');
    },
  });
  await expect(busy.embed('질문', 'query')).rejects.toMatchObject({
    statusCode: 503,
    message: expect.stringContaining('retry'),
    details: { retryAfterMs: 500 },
  });
});

test.each([401, 403, 429])(
  'NVIDIA 응답 %i의 상태를 기록하고 인증과 호출 한도를 구분한다',
  async status => {
    const recordFailure = vi.fn(async () => {});
    const release = vi.fn(async () => {});
    const provider = new NvidiaEmbeddingProvider({
      model: 'nvidia/nemotron-3-embed-1b',
      reserve: async () => ({
        apiKey: 'private-key',
        name: 'NVIDIA_API_KEY_2',
        recordFailure,
        release,
      }),
      fetch: async () =>
        new Response('upstream-private-body', { status, headers: { 'Retry-After': '3' } }),
    });
    await expect(provider.embed('private-query')).rejects.toMatchObject({ statusCode: 503 });
    expect(warn).toHaveBeenLastCalledWith('nvidia.embedding.request_failed', {
      model: 'nvidia/nemotron-3-embed-1b',
      inputType: 'query',
      batchSize: 1,
      keyName: 'NVIDIA_API_KEY_2',
      reason: 'upstream_http_error',
      upstreamStatus: status,
    });
    if (status === 403) expect(recordFailure).not.toHaveBeenCalled();
    else {
      expect(recordFailure).toHaveBeenCalledOnce();
      expect(recordFailure).toHaveBeenCalledWith(status, 3000);
    }
    expect(release).toHaveBeenCalledOnce();
  },
);

test('사용 가능한 NVIDIA 키가 없어도 검색 사용자에게 로그인 오류를 반환하지 않는다', async () => {
  const fetch = vi.fn();
  const provider = new NvidiaEmbeddingProvider({
    reserve: async () => {
      throw new AppError('All NVIDIA API keys failed authentication', 401);
    },
    fetch,
  });
  await expect(provider.embed('질문')).rejects.toMatchObject({ statusCode: 503 });
  expect(fetch).not.toHaveBeenCalled();
  expect(warn).toHaveBeenLastCalledWith(
    'nvidia.embedding.reservation_failed',
    expect.objectContaining({ status: 401 }),
  );
});

test('기본 임베딩 제공자는 NVIDIA이고 EMBEDDING_PROVIDER=openai일 때만 OpenAI를 쓴다', () => {
  vi.stubEnv('EMBEDDING_PROVIDER', '');
  expect(createEmbeddingProvider()).toBeInstanceOf(NvidiaEmbeddingProvider);
  vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
  expect(createEmbeddingProvider()).toBeInstanceOf(OpenAIEmbeddingProvider);
  vi.unstubAllEnvs();
});
