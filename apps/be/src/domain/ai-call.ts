export interface AiSettings {
  provider: string;
  model: string;
  promptVersion: string;
  maxOutputTokens: number;
  maxInputChars: number;
}
export interface AiCallContext {
  signal: AbortSignal;
  settings: AiSettings;
}
export interface AiResult {
  value: unknown;
  usage?: { inputTokens: number; outputTokens: number };
}
