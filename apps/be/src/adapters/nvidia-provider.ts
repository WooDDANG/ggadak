import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '@ggaddak/shared';
import { AiDefaults } from '../config/policies.js';
import config from '../config/index.js';
import { AppError } from '../errors/AppError.js';
import type { AiResult } from '../domain/ai-call.js';
import type { AiProvider, AiProviderRequest } from './ai-provider.js';

export interface NvidiaProviderOptions {
  apiKey?: string;
  baseURL?: string;
  client?: OpenAI;
  enableThinking?: boolean;
  logger?: { debug: (msg: string, ...args: any[]) => void };
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
  private readonly client: OpenAI;
  private readonly enableThinking: boolean;
  private readonly logger: { debug: (msg: string, ...args: any[]) => void };

  constructor(options: NvidiaProviderOptions = {}) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey || process.env.NVIDIA_API_KEY || '',
        baseURL: options.baseURL || process.env.NVIDIA_BASE_URL || AiDefaults.nvidiaBaseUrl,
      });
    this.enableThinking =
      options.enableThinking ?? config.ai.nvidiaEnableThinking ?? AiDefaults.nvidiaEnableThinking;
    this.logger = options.logger ?? createLogger('NVIDIA-PROVIDER');
  }

  async generate(request: AiProviderRequest): Promise<AiResult> {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
      throw new AppError('Invalid AI limits', 422);

    const schemaJson = JSON.stringify(
      zodToJsonSchema(request.outputSchema, { $refStrategy: 'none' }),
    );
    const prompt = `${request.system}\n\nExpected JSON Schema:\n${schemaJson}\n\nSupplied conversation data:\n${request.input}\n\nRespond ONLY with valid JSON conforming strictly to the expected schema without any markdown formatting.`;

    try {
      const stream = (await this.client.chat.completions.create(
        {
          model: request.model,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 1,
          top_p: 0.95,
          max_tokens: request.maxOutputTokens,
          seed: 42,
          // chat_template_kwargs passes enable_thinking for reasoning models when enabled
          ...(this.enableThinking
            ? ({ chat_template_kwargs: { enable_thinking: true } } as any)
            : {}),
          stream: true,
          stream_options: { include_usage: true },
        },
        {
          signal: request.signal,
        },
      )) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let content = '';
      let usage: { inputTokens: number; outputTokens: number } | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as any;
        if (delta?.reasoning_content) {
          this.logger.debug(`[NVIDIA Thinking] ${delta.reasoning_content}`);
        }
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

      if (!content.trim()) {
        throw new AppError('AI returned no content', 422);
      }

      if (usage && usage.outputTokens > request.maxOutputTokens) {
        throw new AppError('NVIDIA AI output exceeds application token limit', 422);
      }

      const parsedValue = extractAndParseJson(content);
      return { value: parsedValue, usage };
    } catch (error) {
      if (
        request.signal.aborted ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as any).name === 'AbortError')
      ) {
        throw new AppError('AI call timed out after configured deadline', 503);
      }
      if (error instanceof AppError) throw error;
      if (error instanceof SyntaxError) throw new AppError('AI returned invalid JSON', 422);
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(`NVIDIA AI analysis failed: ${message}`, 503);
    }
  }
}
