import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@ggaddak/shared';

export interface AiMetricRecord {
  timestamp: string;
  requestId?: string;
  callId: string;
  traceId?: string;
  guildId?: string;
  channelId?: string;
  stage: string;
  model: string;
  provider: string;
  promptVersion?: string;
  durationMs: number;
  ttftMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  repairTriggered?: boolean;
  retryCount?: number;
  issuesCount?: number;
  enableThinking?: boolean;
  success: boolean;
  failureKind?: string;
  failureStage?: string;
  errorSummary?: string;
  status?: number;
  retryable?: boolean;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultLogDir = path.resolve(currentDir, '../../logs');
const defaultLogFilePath = path.join(defaultLogDir, 'ai-metrics.log');

const consoleLogger = createLogger('AI-METRIC');

export function recordAiMetric(metric: AiMetricRecord): void {
  try {
    const isExplicitTestPath = Boolean(process.env.AI_METRICS_LOG_PATH);
    const isTestRunner =
      (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') && !isExplicitTestPath;
    const isMock = metric.provider === 'mock';
    const isPreflightValidationOnly = metric.failureKind === 'configuration';

    // 대시보드(ai-metrics.log)에는 실제 외부 AI 제공자로 전송된 호출만 기록
    if (!isTestRunner && !isMock && !isPreflightValidationOnly) {
      const targetFilePath = process.env.AI_METRICS_LOG_PATH || defaultLogFilePath;
      const targetDir = path.dirname(targetFilePath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const line =
        JSON.stringify({
          ...metric,
          level: metric.success ? 'INFO' : 'WARN',
          service: 'AI-METRIC',
          env: process.env.NODE_ENV || 'development',
        }) + '\n';
      fs.appendFileSync(targetFilePath, line, 'utf8');
    }
  } catch (err) {
    consoleLogger.warn('Failed to append AI metric log', { error: String(err) });
  }

  // Console summary
  const durationSec = (metric.durationMs / 1000).toFixed(1);
  const statusStr = metric.success ? 'SUCCESS' : `FAILED (${metric.failureKind || 'unknown'})`;
  const tokenStr =
    metric.inputTokens !== undefined
      ? ` | in: ${metric.inputTokens} / out: ${metric.outputTokens ?? 0} tokens`
      : '';

  const summary = `[${metric.stage.toUpperCase()}] ${durationSec}s | ${metric.model}${tokenStr} | ${statusStr}`;
  if (metric.success) consoleLogger.info(summary);
  else consoleLogger.warn(summary);
}
