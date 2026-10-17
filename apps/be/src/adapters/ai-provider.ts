import type { AiResult } from '../domain/ai-call.js';
import type { ZodTypeAny } from 'zod';

export interface AiProviderRequest {
  model: string;
  system: string;
  input: string;
  outputSchema: ZodTypeAny;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface AiProvider {
  generate(request: AiProviderRequest): Promise<AiResult>;
}
