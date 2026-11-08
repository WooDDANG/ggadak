export const AiStage = { Extract: 'extract', Verify: 'verify', Repair: 'repair' } as const;
export type AiStage = (typeof AiStage)[keyof typeof AiStage];

export interface AiSettings {
  provider: string;
  model: string;
  promptVersion: string;
  maxOutputTokens: number;
  maxInputChars: number;
  maxInputTokens?: number;
  stageModels?: Partial<Record<AiStage, string>>;
}

export function modelForStage(settings: AiSettings, stage: AiStage | 'baseline'): string {
  return stage === 'baseline' ? settings.model : (settings.stageModels?.[stage] ?? settings.model);
}
export interface AiCallContext {
  signal: AbortSignal;
  settings: AiSettings;
  requestId?: string;
  callId?: string;
  traceId?: string;
  guildId?: string;
  channelId?: string;
  retryCount?: number;
  issuesCount?: number;
}
export interface AiResult {
  value: unknown;
  usage?: { inputTokens: number; outputTokens: number };
  ttftMs?: number;
}
