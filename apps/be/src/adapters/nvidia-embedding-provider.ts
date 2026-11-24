import { createLogger, DeliveryPolicy } from '@ggaddak/shared';
import config from '../config/index.js';
import { AiDefaults } from '../config/policies.js';
import { nvidiaCredentials } from '../config/nvidia-credentials.js';
import { AppError } from '../errors/AppError.js';
import { AnalysisBusyError } from '../errors/analysis-error.js';
import { initPrisma } from '../loaders/prisma.js';
import type { EmbeddingInput, EmbeddingProvider } from '../services/search.service.js';
import { NvidiaKeyPool, nvidiaRetryAfterMs } from './nvidia-key-pool.js';

const logger = createLogger('BE-NVIDIA-EMBEDDING');

interface KeyLease {
  apiKey: string;
  name?: string;
  signal?: AbortSignal;
  recordFailure?(status: number, retryAfterMs?: number): Promise<void>;
  release(): Promise<void>;
}
export interface NvidiaEmbeddingOptions {
  /** 분석과 같은 키 풀에서 키를 빌린다. 분당 호출 예산과 cooldown을 함께 지킨다. */
  reserve?: (signal: AbortSignal) => Promise<KeyLease>;
  fetch?: typeof fetch;
  model?: string;
  baseURL?: string;
}

/** NVIDIA 한 요청에 묶는 문서 수 상한. */
const BATCH_SIZE = 32;

/** NVIDIA NIM 임베딩. 질문(query)과 문서(passage)를 구분하는 비대칭 검색 모델을 쓴다. */
export class NvidiaEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly fetch: typeof fetch;
  private readonly baseURL: string;
  private pool?: NvidiaKeyPool;

  constructor(private readonly options: NvidiaEmbeddingOptions = {}) {
    this.model =
      // EMBEDDING_MODEL은 OpenAI 모델 이름이 남아 있을 수 있어 따로 읽는다.
      options.model ?? (process.env.NVIDIA_EMBEDDING_MODEL || AiDefaults.nvidiaEmbeddingModel);
    this.fetch = options.fetch ?? fetch;
    this.baseURL = (options.baseURL ?? config.ai.nvidiaBaseUrl ?? AiDefaults.nvidiaBaseUrl).replace(
      /\/+$/,
      '',
    );
  }

  async embed(text: string, input: EmbeddingInput = 'query'): Promise<number[]> {
    return (await this.embedBatch([text], input))[0];
  }

  async embedBatch(texts: string[], input: EmbeddingInput): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE)
      vectors.push(...(await this.request(texts.slice(i, i + BATCH_SIZE), input)));
    return vectors;
  }

  private async request(texts: string[], input: EmbeddingInput): Promise<number[][]> {
    const timeout = AbortSignal.timeout(DeliveryPolicy.serviceTimeoutMs);
    const context = { model: this.model, inputType: input, batchSize: texts.length };
    let lease: KeyLease;
    try {
      lease = await this.reserve(timeout);
    } catch (error) {
      const status = error instanceof AppError ? error.statusCode : undefined;
      logger.warn('nvidia.embedding.reservation_failed', { ...context, status });
      if (error instanceof AnalysisBusyError)
        throw new AppError('Embedding keys are busy; retry the search', 503, {
          retryAfterMs: error.retryAfterMs,
        });
      throw new AppError('Embedding provider unavailable; retry the search', 503);
    }
    const signal = lease.signal ? AbortSignal.any([timeout, lease.signal]) : timeout;
    const requestContext = { ...context, keyName: lease.name };
    let response: Response | undefined;
    try {
      response = await this.fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lease.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          input_type: input,
          encoding_format: 'float',
          truncate: 'END',
        }),
        signal,
      });
      if (!response.ok) {
        // 임베딩 모델에만 권한이 없을 수 있는 403은 분석과 공유하는 키 상태에 반영하지 않는다.
        if (response.status === 401 || response.status === 429)
          await lease.recordFailure?.(response.status, nvidiaRetryAfterMs(response));
        throw new Error('provider rejected embedding');
      }
      const { data } = (await response.json()) as {
        data: { index: number; embedding: number[] }[];
      };
      if (data.length !== texts.length) throw new Error('embedding count mismatch');
      return [...data].sort((a, b) => a.index - b.index).map(item => item.embedding);
    } catch {
      const reason = this.requestFailureReason(response, signal, timeout);
      logger.warn('nvidia.embedding.request_failed', {
        ...requestContext,
        reason,
        upstreamStatus: response?.status,
      });
      throw new AppError('Embedding provider unavailable; retry the search', 503);
    } finally {
      try {
        await lease.release();
      } catch {
        logger.warn('nvidia.embedding.release_failed', requestContext);
      }
    }
  }

  private requestFailureReason(
    response: Response | undefined,
    signal: AbortSignal,
    timeout: AbortSignal,
  ) {
    if (response && !response.ok) return 'upstream_http_error';
    if (timeout.aborted) return 'timeout';
    if (signal.aborted) return 'lease_lost';
    return response ? 'invalid_response' : 'transport_error';
  }

  private async reserve(signal: AbortSignal): Promise<KeyLease> {
    if (this.options.reserve) return this.options.reserve(signal);
    this.pool ??= new NvidiaKeyPool(
      initPrisma(),
      config.ai.nvidiaApiKeys?.length ? config.ai.nvidiaApiKeys : nvidiaCredentials(process.env),
      config.ai.nvidiaRequestsPerMinute,
    );
    const pool = this.pool;
    const lease = await pool.reserve(signal);
    return {
      ...lease,
      recordFailure: (status, retryAfterMs) => pool.recordFailure(lease, status, retryAfterMs),
    };
  }
}
