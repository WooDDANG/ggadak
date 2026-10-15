import { Service } from 'typedi';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../errors/AppError.js';
import config, { AppConfig } from '../config/index.js';
import { GraphSchema, VerificationSchema } from '../domain/decision-graph.js';
import {
  GRAPH_SYSTEM_PROMPT,
  VERIFICATION_PROMPT,
  GRAPH_PROMPT_VERSION,
} from '../extractor/graph-prompt.js';

import type { AiSettings, AiCallContext, AiResult } from '../domain/ai-call.js';
import { modelForStage, type AiStage } from '../domain/ai-call.js';
import { runAgyCli, type AgyTransport } from './agy-cli.js';
export type { AiSettings, AiCallContext, AiResult } from '../domain/ai-call.js';
export interface IAiAdapter {
  readonly settings?: AiSettings;
  extractGraph(transcript: string, context: AiCallContext): Promise<AiResult>;
  verifyGraph(transcript: string, graph: unknown, context: AiCallContext): Promise<AiResult>;
  repairGraph(
    transcript: string,
    graph: unknown,
    issues: string[],
    context: AiCallContext,
  ): Promise<AiResult>;
}

function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, any>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(object))
    if (key !== '$schema') result[key] = strictSchema(child);
  if (object.properties) {
    result.properties = Object.fromEntries(
      Object.entries(object.properties).map(([key, child]) => [
        key,
        (object.required ?? []).includes(key)
          ? strictSchema(child)
          : { anyOf: [strictSchema(child), { type: 'null' }] },
      ]),
    );
    result.required = Object.keys(object.properties);
    result.additionalProperties = false;
  }
  return result;
}

// Gemini rejects the graph's large array bounds; Zod still enforces them locally.
function geminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'maxItems')
      .map(([key, child]) => [key, geminiSchema(child)]),
  );
}

@Service({ factory: () => new AiAdapter() })
export class AiAdapter implements IAiAdapter {
  readonly settings: AiSettings;
  private readonly modelLimits = new Map<string, { input: number; output: number }>();
  constructor(
    private readonly options: AppConfig['ai'] = config.ai,
    private readonly environment = config.nodeEnv,
    private readonly transport: typeof fetch = fetch,
    private readonly agyTransport: AgyTransport = runAgyCli,
  ) {
    this.settings = {
      provider: options.provider,
      model:
        options.model ||
        (options.provider === 'agy'
          ? 'gemini-3.8-flash-low'
          : options.provider === 'gemini'
            ? 'gemini-3.8-flash'
            : 'gpt-4o-mini'),
      promptVersion: GRAPH_PROMPT_VERSION,
      maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 8192),
      maxInputChars: Number(
        process.env.AI_MAX_INPUT_CHARS ??
          (['gemini', 'agy'].includes(options.provider) ? 0 : 100000),
      ),
      ...(process.env.AI_MAX_INPUT_TOKENS
        ? { maxInputTokens: Number(process.env.AI_MAX_INPUT_TOKENS) }
        : {}),
      ...(options.stageModels ? { stageModels: { ...options.stageModels } } : {}),
    };
  }
  extractGraph(transcript: string, context: AiCallContext) {
    return this.call('extract', GRAPH_SYSTEM_PROMPT, { transcript }, context);
  }
  verifyGraph(transcript: string, graph: unknown, context: AiCallContext) {
    return this.call('verify', VERIFICATION_PROMPT, { transcript, graph }, context);
  }
  repairGraph(transcript: string, graph: unknown, issues: string[], context: AiCallContext) {
    return this.call(
      'repair',
      GRAPH_SYSTEM_PROMPT + '\nCorrect only reported errors; preserve IDs of existing elements.',
      { transcript, graph, issues },
      context,
    );
  }

  private call(
    stage: AiStage,
    system: string,
    input: { transcript: string; graph?: unknown; issues?: string[] },
    context: AiCallContext,
  ) {
    return this.generateStructured(
      stage,
      system,
      input,
      context,
      stage === 'verify' ? VerificationSchema : GraphSchema,
    );
  }

  /** Shared provider transport; evaluation baseline supplies its frozen schema and prompt. */
  async generateStructured(
    stage: AiStage | 'baseline',
    system: string,
    input: { transcript: string; graph?: unknown; issues?: string[] },
    context: AiCallContext,
    outputSchema: ZodTypeAny,
  ): Promise<AiResult> {
    const { provider, maxOutputTokens, maxInputChars, promptVersion } = context.settings;
    const model = modelForStage(context.settings, stage);
    if (typeof model !== 'string' || !model.trim())
      throw new AppError('Invalid AI model selection', 422);
    if (promptVersion !== GRAPH_PROMPT_VERSION)
      throw new AppError('Unsupported saved prompt version', 422);
    if (
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens <= 0 ||
      !Number.isSafeInteger(maxInputChars) ||
      maxInputChars < 0 ||
      (context.settings.maxInputTokens !== undefined &&
        (!Number.isSafeInteger(context.settings.maxInputTokens) ||
          context.settings.maxInputTokens <= 0))
    )
      throw new AppError('Invalid AI limits', 422);
    if (!['gemini', 'openai', 'agy', 'mock'].includes(provider))
      throw new AppError('Unsupported AI_PROVIDER', 422);
    if (provider === 'mock') {
      if (!['development', 'test'].includes(this.environment))
        throw new AppError('Mock AI requires development or test environment', 422);
      return {
        value:
          stage === 'verify'
            ? { valid: true, issues: [] }
            : {
                summary: 'Development fixture; no inferred candidates',
                nodes: [],
                edges: [],
                discussionProblems: [],
              },
      };
    }
    const prompt = JSON.stringify(input);
    if (maxInputChars > 0 && prompt.length > maxInputChars)
      throw new AppError('AI input limit exceeded', 422);
    const schema = strictSchema(zodToJsonSchema(outputSchema, { $refStrategy: 'none' }));
    if (provider === 'agy') {
      if (context.settings.maxInputTokens !== undefined)
        throw new AppError(
          'AGY does not support exact input-token preflight; remove AI_MAX_INPUT_TOKENS for CLI mode',
          422,
        );
      const response = await this.agyTransport({
        executable: this.options.agyExecutable || 'agy',
        model,
        prompt: system + '\n\nSupplied conversation data:\n' + prompt,
        schema: geminiSchema(schema),
        signal: context.signal,
      });
      if ((response.usage?.outputTokens ?? 0) > maxOutputTokens)
        throw new AppError('AGY output exceeds application token limit', 422);
      return response;
    }
    const key = provider === 'gemini' ? this.options.geminiApiKey : this.options.openaiApiKey;
    if (!key) throw new AppError('Missing API key for AI_PROVIDER=' + provider, 422);
    const gemini = provider === 'gemini';
    const url = gemini
      ? 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent'
      : 'https://api.openai.com/v1/chat/completions';
    try {
      const generationConfig = gemini
        ? {
            responseMimeType: 'application/json',
            responseJsonSchema: geminiSchema(schema),
            maxOutputTokens,
          }
        : undefined;
      const geminiRequest = {
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      };
      if (gemini) {
        const modelUrl = url.slice(0, -':generateContent'.length);
        let limits = this.modelLimits.get(model);
        if (!limits) {
          const metadata = await this.transport(modelUrl, {
            method: 'GET',
            signal: context.signal,
            headers: { 'x-goog-api-key': key },
          });
          if (!metadata.ok)
            throw new AppError(
              'AI model metadata request failed',
              [400, 401, 403, 404, 422].includes(metadata.status) ? 422 : 503,
            );
          const info = (await metadata.json()) as any;
          if (
            ![info.inputTokenLimit, info.outputTokenLimit].every(
              n => Number.isSafeInteger(n) && n > 0,
            )
          )
            throw new AppError('AI model token limits unavailable', 503);
          limits = { input: info.inputTokenLimit, output: info.outputTokenLimit };
          this.modelLimits.set(model, limits);
        }
        if (maxOutputTokens > limits.output)
          throw new AppError('AI output token limit exceeds model capacity', 422);
        const counted = await this.transport(modelUrl + ':countTokens', {
          method: 'POST',
          signal: context.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            generateContentRequest: {
              model: 'models/' + model,
              ...geminiRequest,
            },
          }),
        });
        if (!counted.ok)
          throw new AppError(
            'AI token count request failed',
            [400, 401, 403, 404, 422].includes(counted.status) ? 422 : 503,
          );
        const count = (await counted.json()) as any;
        if (!Number.isSafeInteger(count.totalTokens) || count.totalTokens < 0)
          throw new AppError('AI token count unavailable', 503);
        if (
          count.totalTokens >
          Math.min(limits.input, context.settings.maxInputTokens ?? limits.input)
        )
          throw new AppError('AI input token limit exceeded', 422);
      }
      const response = await this.transport(url, {
        method: 'POST',
        signal: context.signal,
        headers: gemini
          ? { 'Content-Type': 'application/json', 'x-goog-api-key': key }
          : { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify(
          gemini
            ? geminiRequest
            : {
                model,
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: prompt },
                ],
                max_tokens: maxOutputTokens,
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: stage === 'verify' ? 'verification' : 'decision_graph',
                    strict: true,
                    schema,
                  },
                },
              },
        ),
      });
      if (!response.ok)
        throw new AppError(
          'AI provider request failed',
          [400, 401, 403, 404, 422].includes(response.status) ? 422 : 503,
        );
      const body = (await response.json()) as any;
      const candidate = gemini ? body.candidates?.[0] : body.choices?.[0];
      if (
        gemini
          ? candidate?.finishReason !== 'STOP'
          : candidate?.finish_reason !== 'stop' || candidate?.message?.refusal
      )
        throw new AppError('AI response incomplete or refused', 422);
      const content = gemini
        ? candidate.content?.parts
            ?.filter((p: any) => !p.thought)
            .map((p: any) => p.text || '')
            .join('')
        : candidate.message?.content;
      if (!content) throw new AppError('AI returned no content', 422);
      const usage = gemini
        ? {
            inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
          }
        : {
            inputTokens: body.usage?.prompt_tokens ?? 0,
            outputTokens: body.usage?.completion_tokens ?? 0,
          };
      return { value: JSON.parse(content), usage };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof SyntaxError) throw new AppError('AI returned invalid JSON', 422);
      throw new AppError('AI provider temporarily unavailable', 503);
    }
  }
}
