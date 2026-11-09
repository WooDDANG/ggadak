import { AiStage } from '../domain/ai-call.js';
import { randomUUID } from 'node:crypto';
import { AiDefaults } from '../config/policies.js';
import { Service } from 'typedi';
import { AppError } from '../errors/AppError.js';
import config, { AppConfig } from '../config/index.js';
import { GraphSchema, VerificationSchema } from '../domain/decision-graph.js';
import {
  GRAPH_SYSTEM_PROMPT,
  VERIFICATION_PROMPT,
  GRAPH_PROMPT_VERSION,
  LEGACY_GRAPH_SYSTEM_PROMPT,
  LEGACY_VERIFICATION_PROMPT,
} from '../extractor/graph-prompt.js';
import type { AiSettings, AiCallContext } from '../domain/ai-call.js';
import { modelForStage } from '../domain/ai-call.js';
import { createDefaultProvider } from './ai-provider-factory.js';
import { recordAiMetric, type AiMetricRecord } from './ai-metrics-logger.js';
import { classifyAiFailure } from '../errors/ai-diagnostics.js';
import type { AiProvider } from './ai-provider.js';
import type { IAiAdapter } from '../domain/ai-analysis.js';
export type { IAiAdapter } from '../domain/ai-analysis.js';
export type { AiSettings, AiCallContext, AiResult } from '../domain/ai-call.js';

@Service({ factory: () => new AiAdapter() })
export class AiAdapter implements IAiAdapter {
  readonly settings: AiSettings;
  private readonly configuredProvider: string;

  constructor(
    private readonly options: AppConfig['ai'] = config.ai,
    private readonly environment = config.nodeEnv,
    private readonly provider: AiProvider = createDefaultProvider(options),
    private readonly metricRecorder: (metric: AiMetricRecord) => void = recordAiMetric,
  ) {
    this.configuredProvider = options.provider;
    this.settings = {
      provider: options.provider,
      model:
        options.model ||
        (options.provider === 'nvidia' ? AiDefaults.models.nvidia : AiDefaults.models.agy),
      promptVersion: GRAPH_PROMPT_VERSION,
      maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || AiDefaults.maxOutputTokens),
      maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS ?? 0),
      ...(process.env.AI_MAX_INPUT_TOKENS
        ? { maxInputTokens: Number(process.env.AI_MAX_INPUT_TOKENS) }
        : {}),
      ...(options.stageModels ? { stageModels: { ...options.stageModels } } : {}),
    };
  }

  extractGraph(transcript: string, context: AiCallContext) {
    return this.call(
      AiStage.Extract,
      context.settings.promptVersion === 'agentic-1'
        ? LEGACY_GRAPH_SYSTEM_PROMPT
        : GRAPH_SYSTEM_PROMPT,
      { transcript },
      context,
    );
  }

  verifyGraph(transcript: string, graph: unknown, context: AiCallContext) {
    return this.call(
      AiStage.Verify,
      context.settings.promptVersion === 'agentic-1'
        ? LEGACY_VERIFICATION_PROMPT
        : VERIFICATION_PROMPT,
      { transcript, graph },
      context,
    );
  }

  repairGraph(transcript: string, graph: unknown, issues: string[], context: AiCallContext) {
    return this.call(
      AiStage.Repair,
      (context.settings.promptVersion === 'agentic-1'
        ? LEGACY_GRAPH_SYSTEM_PROMPT
        : GRAPH_SYSTEM_PROMPT) +
        '\nCorrect only reported errors; preserve IDs of existing elements.',
      { transcript, graph, issues },
      context,
    );
  }

  private async call(
    stage: AiStage,
    system: string,
    input: { transcript: string; graph?: unknown; issues?: string[] },
    context: AiCallContext,
  ) {
    const { provider, maxOutputTokens, maxInputChars, promptVersion, maxInputTokens } =
      context.settings;
    const model = modelForStage(context.settings, stage);
    const startTime = performance.now();
    const callId = context.callId ?? randomUUID();
    const identity = {
      requestId: context.requestId,
      callId,
      traceId: context.traceId,
      guildId: context.guildId,
      channelId: context.channelId,
      stage,
      model,
      provider,
      promptVersion,
      retryCount: context.retryCount ?? 0,
      repairTriggered: stage === AiStage.Repair,
      issuesCount: context.issuesCount ?? 0,
      enableThinking:
        provider === 'nvidia'
          ? (this.options.nvidiaEnableThinking ?? AiDefaults.nvidiaEnableThinking)
          : undefined,
    };
    try {
      if (typeof model !== 'string' || !model.trim())
        throw new AppError('Invalid AI model selection', 422);
      if (promptVersion !== GRAPH_PROMPT_VERSION && promptVersion !== 'agentic-1')
        throw new AppError('Unsupported saved prompt version', 422);
      if (
        !Number.isSafeInteger(maxOutputTokens) ||
        maxOutputTokens <= 0 ||
        !Number.isSafeInteger(maxInputChars) ||
        maxInputChars < 0 ||
        (maxInputTokens !== undefined &&
          (!Number.isSafeInteger(maxInputTokens) || maxInputTokens <= 0))
      )
        throw new AppError('Invalid AI limits', 422);
      if (provider !== this.configuredProvider)
        throw new AppError('Saved AI provider does not match configured provider', 422);
      if (provider === 'mock') {
        if (!['development', 'test'].includes(this.environment))
          throw new AppError('Mock AI requires development or test environment', 422);
        return {
          value:
            stage === AiStage.Verify
              ? { valid: true, issues: [] }
              : {
                  summary: 'Development fixture; no inferred candidates',
                  nodes: [],
                  edges: [],
                  discussionProblems: [],
                },
        };
      }
      if (provider !== 'agy' && provider !== 'nvidia')
        throw new AppError('Unsupported AI_PROVIDER; expected agy or nvidia', 422);
      if (provider === 'agy' && maxInputTokens !== undefined)
        throw new AppError(
          'AGY does not support exact input-token preflight; remove AI_MAX_INPUT_TOKENS for CLI mode',
          422,
        );
      if (provider === 'nvidia' && maxInputTokens !== undefined)
        throw new AppError('NVIDIA does not support exact input-token preflight', 422);
      const serializedInput = JSON.stringify(input);
      if (maxInputChars > 0 && serializedInput.length > maxInputChars)
        throw new AppError('AI input limit exceeded', 422);
      const result = await this.provider.generate({
        model,
        system,
        input: serializedInput,
        outputSchema: stage === AiStage.Verify ? VerificationSchema : GraphSchema,
        maxOutputTokens,
        signal: context.signal,
      });
      const durationMs = Math.round(performance.now() - startTime);
      this.metricRecorder({
        timestamp: new Date().toISOString(),
        ...identity,
        durationMs,
        ttftMs: result.ttftMs,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalTokens:
          result.usage === undefined
            ? undefined
            : result.usage.inputTokens + result.usage.outputTokens,
        success: true,
      });
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.metricRecorder({
        timestamp: new Date().toISOString(),
        ...identity,
        durationMs,
        success: false,
        failureStage: stage,
        ...classifyAiFailure(error, stage),
      });
      throw error;
    }
  }
}
