import { AiStage } from '../domain/ai-call.js';
import { AiDefaults } from '../config/policies.js';
import { Service } from 'typedi';
import { AppError } from '../errors/AppError.js';
import config, { AppConfig } from '../config/index.js';
import { GraphSchema, VerificationSchema } from '../domain/decision-graph.js';
import {
  GRAPH_SYSTEM_PROMPT,
  VERIFICATION_PROMPT,
  GRAPH_PROMPT_VERSION,
} from '../extractor/graph-prompt.js';
import type { AiSettings, AiCallContext, AiResult } from '../domain/ai-call.js';
import { modelForStage } from '../domain/ai-call.js';
import { AgyProvider } from './agy-provider.js';
import type { AiProvider } from './ai-provider.js';
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

@Service({ factory: () => new AiAdapter() })
export class AiAdapter implements IAiAdapter {
  readonly settings: AiSettings;

  constructor(
    private readonly options: AppConfig['ai'] = config.ai,
    private readonly environment = config.nodeEnv,
    private readonly provider: AiProvider = new AgyProvider({
      executable: options.agyExecutable,
    }),
  ) {
    this.settings = {
      provider: options.provider,
      model: options.model || AiDefaults.models.agy,
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
    return this.call(AiStage.Extract, GRAPH_SYSTEM_PROMPT, { transcript }, context);
  }

  verifyGraph(transcript: string, graph: unknown, context: AiCallContext) {
    return this.call(AiStage.Verify, VERIFICATION_PROMPT, { transcript, graph }, context);
  }

  repairGraph(transcript: string, graph: unknown, issues: string[], context: AiCallContext) {
    return this.call(
      AiStage.Repair,
      GRAPH_SYSTEM_PROMPT + '\nCorrect only reported errors; preserve IDs of existing elements.',
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
    if (typeof model !== 'string' || !model.trim())
      throw new AppError('Invalid AI model selection', 422);
    if (promptVersion !== GRAPH_PROMPT_VERSION)
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
    if (provider !== 'agy') throw new AppError('Unsupported AI_PROVIDER; expected agy', 422);
    if (maxInputTokens !== undefined)
      throw new AppError(
        'AGY does not support exact input-token preflight; remove AI_MAX_INPUT_TOKENS for CLI mode',
        422,
      );
    const serializedInput = JSON.stringify(input);
    if (maxInputChars > 0 && serializedInput.length > maxInputChars)
      throw new AppError('AI input limit exceeded', 422);
    return this.provider.generate({
      model,
      system,
      input: serializedInput,
      outputSchema: stage === AiStage.Verify ? VerificationSchema : GraphSchema,
      maxOutputTokens,
      signal: context.signal,
    });
  }
}
