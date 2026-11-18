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

test('진단 데이터에서 환경 변수의 인증 값을 제거한다', () => {
  const previous = process.env.NVIDIA_API_KEY_1;
  process.env.NVIDIA_API_KEY_1 = 'test-secret-value';
  try {
    expect(boundedProviderResponse({ response: '출력 test-secret-value' })).toContain('[REDACTED]');
    expect(boundedProviderResponse({ response: '출력 test-secret-value' })).not.toContain(
      'test-secret-value',
    );
  } finally {
    if (previous === undefined) delete process.env.NVIDIA_API_KEY_1;
    else process.env.NVIDIA_API_KEY_1 = previous;
  }
});
