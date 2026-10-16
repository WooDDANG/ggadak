import { DeliveryPolicy, ServiceDefaults } from '@ggaddak/shared';

export const BotPolicy = {
  triggerEmoji: '📌',
  policyRefreshMs: 60_000,
  maxDebounceMs: 60_000,
} as const;
export function backendUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.BE_URL || ServiceDefaults.backendUrl;
}
export function reviewWebUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.REVIEW_WEB_URL || env.WEB_URL || ServiceDefaults.webUrl;
}
export function deliveryOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    maxAttempts: Number(env.ANALYSIS_MAX_ATTEMPTS || DeliveryPolicy.maxAttempts),
    initialDelayMs: Number(env.ANALYSIS_RETRY_DELAY_MS || DeliveryPolicy.initialRetryMs),
    maxDelayMs: Number(env.ANALYSIS_MAX_DELAY_MS || DeliveryPolicy.maxRetryMs),
    timeoutMs: Number(env.ANALYSIS_TIMEOUT_MS || DeliveryPolicy.analysisTimeoutMs),
    jitter: Number(env.ANALYSIS_RETRY_JITTER || DeliveryPolicy.retryJitter),
  };
}
