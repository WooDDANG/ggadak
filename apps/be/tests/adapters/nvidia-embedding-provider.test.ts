import { test, expect, vi } from 'vitest';
import { NvidiaEmbeddingProvider } from '../../src/adapters/nvidia-embedding-provider.js';
import {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from '../../src/services/search.service.js';
import { AnalysisBusyError } from '../../src/errors/analysis-error.js';

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
    reserve: keys.reserve,
    fetch: async (_url, init) => {
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

test('NVIDIA 임베딩 실패와 빈 키 없음은 다시 시도할 수 있는 503으로 알리고 키를 돌려준다', async () => {
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
  });
});

test('기본 임베딩 제공자는 NVIDIA이고 EMBEDDING_PROVIDER=openai일 때만 OpenAI를 쓴다', () => {
  vi.stubEnv('EMBEDDING_PROVIDER', '');
  expect(createEmbeddingProvider()).toBeInstanceOf(NvidiaEmbeddingProvider);
  vi.stubEnv('EMBEDDING_PROVIDER', 'openai');
  expect(createEmbeddingProvider()).toBeInstanceOf(OpenAIEmbeddingProvider);
  vi.unstubAllEnvs();
});
