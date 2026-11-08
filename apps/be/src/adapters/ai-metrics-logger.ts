import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@ggaddak/shared';

export interface AiMetricRecord {
  timestamp: string;
  stage: string;
  model: string;
  provider: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  error?: string;
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
      const line = JSON.stringify(metric) + '\n';
      fs.appendFileSync(logFilePath, line, 'utf8');
    }
  } catch (err) {
    consoleLogger.warn('Failed to append AI metric log', { error: String(err) });
  }

  // Console summary
  const durationSec = (metric.durationMs / 1000).toFixed(1);
  const statusStr = metric.success ? 'SUCCESS' : `FAILED (${metric.error || 'unknown'})`;
  const tokenStr =
    metric.inputTokens !== undefined
      ? ` | in: ${metric.inputTokens} / out: ${metric.outputTokens ?? 0} tokens`
      : '';

  consoleLogger.info(
    `[${metric.stage.toUpperCase()}] ${durationSec}s | ${metric.model}${tokenStr} | ${statusStr}`,
  );
}
