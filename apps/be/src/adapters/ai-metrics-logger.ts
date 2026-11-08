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
const logDir = path.resolve(currentDir, '../../logs');
const logFilePath = path.join(logDir, 'ai-metrics.log');

const consoleLogger = createLogger('AI-METRIC');

export function recordAiMetric(metric: AiMetricRecord): void {
  try {
    if (process.env.NODE_ENV !== 'test') {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const line =
        JSON.stringify({
          ...metric,
          level: metric.success ? 'INFO' : 'WARN',
          service: 'AI-METRIC',
          env: process.env.NODE_ENV || 'development',
        }) + '\n';
      fs.appendFileSync(logFilePath, line, 'utf8');
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
