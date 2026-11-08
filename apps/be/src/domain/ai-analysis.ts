import type { AiSettings, AiCallContext, AiResult } from './ai-call.js';

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
