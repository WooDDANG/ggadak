import { zodToJsonSchema } from 'zod-to-json-schema';
import { AiDefaults } from '../config/policies.js';
import { AppError } from '../errors/AppError.js';
import type { AiResult } from '../domain/ai-call.js';
import { runAgyCli, type AgyTransport } from './agy-cli.js';
import type { AiProvider, AiProviderRequest } from './ai-provider.js';

function agySchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(agySchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema' && key !== 'maxItems')
      .map(([key, child]) => [key, agySchema(child)]),
  );
}

export class AgyProvider implements AiProvider {
  constructor(
    private readonly options: { executable?: string } = {},
    private readonly transport: AgyTransport = runAgyCli,
  ) {}

  async generate(request: AiProviderRequest): Promise<AiResult> {
    if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0)
      throw new AppError('Invalid AI limits', 422);
    try {
      const result = await this.transport({
        executable: this.options.executable || AiDefaults.agyExecutable,
        model: request.model,
        prompt: request.system + '\n\nSupplied conversation data:\n' + request.input,
        schema: agySchema(zodToJsonSchema(request.outputSchema, { $refStrategy: 'none' })),
        signal: request.signal,
      });
      if ((result.usage?.outputTokens ?? 0) > request.maxOutputTokens)
        throw new AppError('AGY output exceeds application token limit', 422);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AGY analysis failed or unavailable', 503);
    }
  }
}
