import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AiDefaults } from '../config/policies.js';
import config from '../config/index.js';
import { AppError } from '../errors/AppError.js';
import { DEFAULT_SEED, LEASE_LOST, type AiResult } from '../domain/ai-call.js';
import type { AiProvider, AiProviderRequest } from './ai-provider.js';
import { NvidiaKeyPool, type NvidiaReservation } from './nvidia-key-pool.js';
import { nvidiaCredentials, type NvidiaCredential } from '../config/nvidia-credentials.js';
import { initPrisma } from '../loaders/prisma.js';
import { createLogger } from '@ggaddak/shared';
import { boundedProviderResponse } from '../errors/ai-diagnostics.js';
import { ExtractGraphSchema, VerificationSchema } from '../domain/decision-graph.js';

const logger = createLogger('BE-NVIDIA');

export interface NvidiaProviderOptions {
  apiKey?: string;
  apiKeys?: NvidiaCredential[];
  requestsPerMinute?: number;
  keyPool?: NvidiaKeyPool;
  clientFactory?: (apiKey: string) => OpenAI;
  baseURL?: string;
  client?: OpenAI;
  enableThinking?: boolean;
  jsonMode?: boolean;
}

export function extractAndParseJson(text: string): unknown {
  const trimmed = text.trim();
  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // 2. Markdown code block extraction (```json ... ``` or ``` ... ```)
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // fall through
      }
    }
    // 3. Outermost JSON object extraction
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new SyntaxError('Could not parse valid JSON from AI response');
  }
}

export class NvidiaProvider implements AiProvider {
  private readonly client?: OpenAI;
  private readonly pool?: NvidiaKeyPool;
  private readonly clients = new Map<string, OpenAI>();
  private readonly clientFactory: (apiKey: string) => OpenAI;
  private readonly enableThinking: boolean;
  private readonly jsonMode: boolean;

  constructor(options: NvidiaProviderOptions = {}) {
    this.client = options.client;
    this.clientFactory =
      options.clientFactory ??
      (apiKey =>
        new OpenAI({
          apiKey,
          baseURL: options.baseURL || process.env.NVIDIA_BASE_URL || AiDefaults.nvidiaBaseUrl,
          maxRetries: 0,
        }));
    if (!this.client) {
      this.pool =
        options.keyPool ??
        new NvidiaKeyPool(
          initPrisma(),
          options.apiKeys ??
            (options.apiKey?.trim()
              ? [{ name: 'NVIDIA_API_KEY', apiKey: options.apiKey.trim() }]
              : nvidiaCredentials(process.env)),
          options.requestsPerMinute ?? config.ai.nvidiaRequestsPerMinute,
        );
    }
    this.enableThinking =
      options.enableThinking ?? config.ai.nvidiaEnableThinking ?? AiDefaults.nvidiaEnableThinking;
    this.jsonMode = options.jsonMode ?? process.env.NVIDIA_JSON_MODE !== 'false';
  }

  async generate(request: AiProviderRequest): Promise<AiResult> {
    if (this.client) return this.generateWithClient(request, this.client);
    const reserved = await this.reserve(request.signal);
    try {
      return await reserved.generate(request);
    } finally {
      await reserved.release?.();
    }
  }

  async reserve(signal: AbortSignal): Promise<AiProvider> {
    if (signal.aborted) throw new AppError('NVIDIA reservation cancelled', 503);
    if (!this.pool) return this;
    const key = await this.pool.reserve(signal);
    try {
      let client = this.clients.get(key.apiKey);
      if (!client) {
        client = this.clientFactory(key.apiKey);
        this.clients.set(key.apiKey, client);
      }
      logger.info('nvidia.key.selected', { keyName: key.name });
      const selectedClient = client;
      return {
        generate: request =>
          this.generateWithClient(
            { ...request, signal: AbortSignal.any([request.signal, key.signal]) },
            selectedClient,
            key,
          ),
        release: key.release,
      };
    } catch (error) {
      await key.release();
      throw error;
    }
  }

  private async generateWithClient(
    request: AiProviderRequest,
    client: OpenAI,
    key?: NvidiaReservation,
  ): Promise<AiResult> {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
      throw new AppError('Invalid AI limits', 422);

    const schemaJson = JSON.stringify(
      zodToJsonSchema(request.outputSchema, { $refStrategy: 'none' }),
    );
    const schemaName =
      request.structuredOutput === false
        ? undefined
        : request.outputSchema === VerificationSchema &&
            process.env.NVIDIA_VERIFY_JSON_SCHEMA !== 'false'
          ? 'verification'
          : request.outputSchema === ExtractGraphSchema &&
              process.env.NVIDIA_EXTRACT_JSON_SCHEMA !== 'false'
            ? 'extract_graph'
            : undefined;
    const prompt = `${request.system}\n\nExpected JSON Schema:\n${schemaJson}\n\nSupplied conversation data:\n${request.input}\n\nRespond ONLY with valid JSON conforming strictly to the expected schema without any markdown formatting.`;

    let content = '';
    const startedAt = performance.now();
    let ttftMs: number | undefined;
    try {
      if (request.signal.aborted) throw new AppError('NVIDIA call cancelled', 503);
      const stream = (await client.chat.completions.create(
        {
          model: request.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          ...(this.jsonMode
            ? {
                response_format: schemaName
                  ? {
                      type: 'json_schema' as const,
                      json_schema: { name: schemaName, schema: JSON.parse(schemaJson) },
                    }
                  : { type: 'json_object' as const },
              }
            : {}),
          top_p: 0.95,
          max_tokens: request.maxOutputTokens,
          seed: request.seed ?? DEFAULT_SEED,
          // chat_template_kwargs passes enable_thinking explicitly to override model default
          ...({ chat_template_kwargs: { enable_thinking: this.enableThinking } } as any),
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          signal: request.signal,
          maxRetries: 0,
        },
      )) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let finishReason: string | null | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as any;
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
        if (ttftMs === undefined && (delta?.content || delta?.reasoning_content))
          ttftMs = Math.round(performance.now() - startedAt);
        if (delta?.content) {
          content += delta.content;
        }
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      // 잘림은 빈 응답·형식 오류보다 먼저 판정한다. 같은 상한으로 다시 보내도 결과가 같다.
      if (
        finishReason === 'length' ||
        (usage !== undefined && usage.outputTokens > request.maxOutputTokens)
      ) {
        throw new AppError('NVIDIA AI output exceeds application token limit', 422, {
          providerResponse: content,
          failureKind: 'output-truncated',
        });
      }

      if (!content.trim()) {
        throw new AppError('AI returned no content', 422, {
          providerResponse: content,
          failureKind: 'output-empty',
        });
      }

      const parsedValue = extractAndParseJson(content);
      if (key) logger.info('nvidia.key.completed', { keyName: key.name });
      return { value: parsedValue, usage, ttftMs };
    } catch (error) {
      const status =
        error instanceof AppError
          ? error.statusCode
          : ((error as { status?: number })?.status ?? 503);
      if (key && this.pool) {
        const retryAfterMs = nvidiaRetryAfterMs(error);
        await this.pool.recordFailure(key, status, retryAfterMs);
        logger.warn('nvidia.key.failed', {
          keyName: key.name,
          status,
          errorType: error instanceof Error ? error.name : 'unknown',
          retryAfterMs: status === 429 ? retryAfterMs : undefined,
        });
        if (status === 401 || status === 403)
          throw new AppError('NVIDIA key authentication failed; retry with another key', 503, {
            nvidiaAccountFailure: true,
            failureKind: 'auth',
          });
      }
      if (
        request.signal.aborted ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as any).name === 'AbortError')
      ) {
        // 중단 원인(타임아웃·소유권 상실)은 호출 신호를 소유한 워크플로가 판정한다.
        const leaseLost = request.signal.reason === LEASE_LOST;
        throw new AppError(
          leaseLost ? 'Analysis ownership lost' : 'AI call timed out after configured deadline',
          503,
          { providerResponse: content, failureKind: leaseLost ? 'lease-lost' : 'timeout' },
        );
      }
      if (error instanceof AppError) throw error;
      if (error instanceof SyntaxError)
        throw new AppError('AI returned invalid JSON', 422, {
          providerResponse: content,
          failureKind: 'output-unparseable',
        });
      const providerError = error as { status?: number; error?: unknown; message?: string };
      let diagnostic: string;
      try {
        const value = providerError.error ?? providerError.message ?? String(error);
        diagnostic = typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        diagnostic = 'NVIDIA provider error';
      }
      for (const apiKey of this.clients.keys())
        diagnostic = diagnostic.replaceAll(apiKey, '[REDACTED]');
      throw new AppError('NVIDIA AI analysis failed', providerError.status ?? 503, {
        providerResponse: boundedProviderResponse(diagnostic),
        nvidiaAccountFailure: key !== undefined && providerError.status === 429,
        retryAfterMs: providerError.status === 429 ? nvidiaRetryAfterMs(error) : undefined,
      });
    }
  }
}

export function nvidiaRetryAfterMs(error: unknown, now = Date.now()): number {
  const headers = (error as { headers?: Headers | Record<string, string> } | null)?.headers;
  const value =
    headers &&
    ('get' in headers && typeof headers.get === 'function'
      ? headers.get('retry-after')
      : (headers as Record<string, string>)['retry-after']);
  if (!value?.trim()) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return seconds >= 0 && Number.isSafeInteger(Math.ceil(seconds * 1000))
      ? Math.ceil(seconds * 1000)
      : 60_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 60_000;
}
