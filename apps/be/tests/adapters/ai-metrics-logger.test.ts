import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { test, expect } from 'vitest';
import { recordAiMetric, recordVerificationMetric } from '../../src/adapters/ai-metrics-logger.js';

test('검증 지표는 호출 지표와 분리해 상관관계와 결과를 기록한다', () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'verify-metric-'));
  const filename = path.join(directory, 'verification.jsonl');
  process.env.AI_VERIFICATION_METRICS_LOG_PATH = filename;
  try {
    recordVerificationMetric({
      requestId: 'request',
      callId: 'call',
      stage: 'reverify',
      outcome: 'invalid',
    });
    expect(JSON.parse(fs.readFileSync(filename, 'utf8'))).toMatchObject({
      requestId: 'request',
      callId: 'call',
      stage: 'reverify',
      outcome: 'invalid',
    });
  } finally {
    delete process.env.AI_VERIFICATION_METRICS_LOG_PATH;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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
