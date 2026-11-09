import { expect, test } from 'vitest';
import { AppError } from '../../src/errors/AppError.js';
import { boundedProviderResponse, classifyAiFailure } from '../../src/errors/ai-diagnostics.js';

test('failure kinds stay stable when provider messages vary', () => {
  expect(
    classifyAiFailure(new AppError('NVIDIA AI analysis failed', 503), 'extract'),
  ).toMatchObject({
    failureKind: 'provider',
    retryable: true,
  });
  expect(
    classifyAiFailure(new AppError('NVIDIA AI analysis failed: request 481', 429), 'verify'),
  ).toMatchObject({ failureKind: 'rate-limit', retryable: true });
  expect(
    classifyAiFailure(new AppError('AI call timed out after configured deadline', 503), 'verify'),
  ).toMatchObject({ failureKind: 'timeout', retryable: true });
  expect(
    classifyAiFailure(new AppError('Analysis validation failed after repair', 422), 'repair'),
  ).toMatchObject({ failureKind: 'semantic-verification', retryable: false });
});

test('stored provider response redacts secrets and has a byte limit', () => {
  const stored = boundedProviderResponse(
    'Bearer secret-token {"api_key":"other-secret"} ' + '가'.repeat(4000),
  )!;
  expect(stored).toContain('Bearer [REDACTED]');
  expect(stored).not.toContain('secret-token');
  expect(stored).not.toContain('other-secret');
  expect(Buffer.byteLength(stored)).toBeLessThanOrEqual(8192);
});
