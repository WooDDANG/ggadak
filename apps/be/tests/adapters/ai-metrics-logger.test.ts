import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import { recordAiMetric } from '../../src/adapters/ai-metrics-logger.js';

test('recordAiMetric appends a valid JSON-line to ai-metrics.log when path is configured', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const testLogFilePath = path.resolve(currentDir, '../../logs/ai-metrics.test.log');

  if (fs.existsSync(testLogFilePath)) {
    fs.unlinkSync(testLogFilePath);
  }

  process.env.AI_METRICS_LOG_PATH = testLogFilePath;

  const testRecord = {
    timestamp: '2026-11-08T13:30:00.000Z',
    callId: 'call-1',
    stage: 'extract',
    model: 'nvidia/nemotron-test',
    provider: 'nvidia',
    durationMs: 1250,
    inputTokens: 300,
    outputTokens: 150,
    success: true,
  };

  try {
    recordAiMetric(testRecord);

    expect(fs.existsSync(testLogFilePath)).toBe(true);
    const content = fs.readFileSync(testLogFilePath, 'utf8');
    expect(content).toContain('"model":"nvidia/nemotron-test"');
    expect(content).toContain('"durationMs":1250');
  } finally {
    delete process.env.AI_METRICS_LOG_PATH;
    if (fs.existsSync(testLogFilePath)) {
      fs.unlinkSync(testLogFilePath);
    }
  }
});
