import { expect, test } from 'vitest';
import { AppError } from '../../src/errors/AppError.js';
import {
  boundedProviderResponse,
  classifyAiFailure,
  safeAiErrorCode,
} from '../../src/errors/ai-diagnostics.js';

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

test('던지는 쪽이 지정한 실패 코드가 메시지보다 우선한다', () => {
  // 'token limit' 문구는 정규식이면 configuration이 되지만, 지정한 코드는 잘림이다.
  const truncated = new AppError('NVIDIA AI output exceeds application token limit', 422, {
    failureKind: 'output-truncated',
  });
  expect(classifyAiFailure(truncated, 'extract')).toMatchObject({
    failureKind: 'output-truncated',
  });
  expect(safeAiErrorCode(truncated)).toBe('output_truncated');
  // 문구를 바꿔도 분류와 로그 코드가 유지된다.
  const renamed = new AppError('임의로 바뀐 문구', 503, { failureKind: 'lease-lost' });
  expect(classifyAiFailure(renamed, 'verify')).toMatchObject({ failureKind: 'lease-lost' });
  expect(safeAiErrorCode(renamed)).toBe('lease_lost');
});

test('코드 없는 provider 인증 오류는 auth로 분류한다', () => {
  expect(
    classifyAiFailure(new AppError('All NVIDIA API keys failed authentication', 401), 'extract'),
  ).toMatchObject({ failureKind: 'auth', retryable: false });
});

test('재시도 판정은 HTTP 상태가 아니라 실패 코드를 따른다', () => {
  const retryable = (status: number, failureKind: string) =>
    classifyAiFailure(new AppError('x', status, { failureKind }), 'extract').retryable;
  expect(retryable(422, 'output-empty')).toBe(true);
  expect(retryable(422, 'output-unparseable')).toBe(true);
  expect(retryable(422, 'verify-format')).toBe(true);
  expect(retryable(422, 'graph-structure')).toBe(true);
  expect(retryable(422, 'output-truncated')).toBe(false);
  expect(retryable(503, 'auth')).toBe(false);
  expect(retryable(503, 'lease-lost')).toBe(false);
  expect(retryable(503, 'timeout')).toBe(true);
});
