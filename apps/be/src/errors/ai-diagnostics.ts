import { AppError } from './AppError.js';
import { NOT_RETRYABLE_FAILURES, isAiFailureKind, type AiFailureKind } from '../domain/ai-call.js';

export {
  NON_RETRYABLE_SESSION_FAILURES,
  OUTPUT_FORMAT_FAILURES,
  SESSION_SCOPED_FAILURES,
  type AiFailureKind,
} from '../domain/ai-call.js';

/** 던지는 쪽이 지정한 실패 코드. 없으면 undefined. */
export function explicitFailureKind(error: unknown): AiFailureKind | undefined {
  const kind = error instanceof AppError ? error.details?.failureKind : undefined;
  return isAiFailureKind(kind) ? kind : undefined;
}

const summaries: Record<AiFailureKind, string> = {
  timeout: 'AI call timed out',
  'rate-limit': 'AI provider rate limit reached',
  provider: 'AI provider failed',
  auth: 'AI provider authentication failed',
  'graph-structure': 'AI graph structure was invalid',
  'semantic-verification': 'AI verification failed',
  configuration: 'AI configuration was invalid',
  'output-empty': 'AI returned no content',
  'output-unparseable': 'AI output was not valid JSON',
  'output-truncated': 'AI output reached the token limit',
  'verify-format': 'AI verification response violated its schema',
  'lease-lost': 'Analysis ownership was lost',
  'budget-exhausted': 'Analysis call budget was exhausted',
};

/** 원문과 provider 메시지 없이 로그에 남길 수 있는 오류 원인만 분류한다. */
export function safeAiErrorCode(error: unknown): string {
  if (!(error instanceof AppError)) return 'unexpected_error';
  const kind = explicitFailureKind(error);
  if (kind) return kind.replaceAll('-', '_');
  // 코드 없이 던지는 기존 오류만 메시지로 찾는다.
  const codes: Record<string, string> = {
    'AI returned invalid JSON': 'invalid_json',
    'AI returned no content': 'empty_response',
    'AI call timed out after configured deadline': 'timeout',
    'AI call timeout': 'timeout',
    'Analysis ownership lost': 'ownership_lost',
    'Invalid AI verification response': 'invalid_verification',
    'Analysis validation failed after repair': 'validation_after_repair',
    'NVIDIA AI analysis failed': 'provider_error',
    'NVIDIA key authentication failed; retry with another key': 'provider_authentication',
  };
  return codes[error.message] ?? 'other';
}

export function classifyAiFailure(error: unknown, stage: string) {
  const status =
    error instanceof AppError
      ? error.statusCode
      : typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : 500;
  const message = error instanceof Error ? error.message : String(error);
  const explicitKind = explicitFailureKind(error);
  let kind: AiFailureKind = 'provider';
  // 정규식은 코드 없이 들어온 외부 provider 오류에만 쓴다.
  if (explicitKind) kind = explicitKind;
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status === 429 || /quota|rate.?limit|resource_exhausted/i.test(message))
    kind = 'rate-limit';
  else if (/timed?\s*out|timeout|deadline|cancel|abort/i.test(message)) kind = 'timeout';
  else if (
    /config|unsupported|invalid ai model|invalid ai limits|input limit|token limit|preflight/i.test(
      message,
    )
  )
    kind = 'configuration';
  else if (/invalid json|malformed|schema|graph structure|invalid endpoint/i.test(message))
    kind = 'graph-structure';
  else if (/verif|validation|repair/i.test(message) && stage !== 'extract')
    kind = 'semantic-verification';
  return {
    failureKind: kind,
    errorSummary: summaries[kind],
    status,
    // 지정한 코드가 있으면 코드표로, 없으면 HTTP 상태로 판정한다.
    retryable: explicitKind
      ? !NOT_RETRYABLE_FAILURES.includes(explicitKind)
      : status === 408 || status === 429 || status >= 500,
  };
}

/** 진단 데이터의 인증 정보를 제거하고 크기를 제한한다. */
export function boundedProviderResponse(value: unknown): string | undefined {
  if (value == null) return undefined;
  let raw: string;
  try {
    raw = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  let redacted = raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:api[_-]?key|authorization|token|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      '$1[REDACTED]',
    );
  for (const [name, value] of Object.entries(process.env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && value && value.length >= 8)
      redacted = redacted.replaceAll(value, '[REDACTED]');
  }
  const bytes = Buffer.from(redacted, 'utf8');
  if (bytes.length <= 8192) return redacted;
  let clipped = bytes.subarray(0, 8192).toString('utf8');
  while (Buffer.byteLength(clipped, 'utf8') > 8192) clipped = clipped.slice(0, -1);
  return clipped;
}

export function providerResponseFrom(error: unknown): string | undefined {
  if (error instanceof AppError) return boundedProviderResponse(error.details?.providerResponse);
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { response?: unknown; error?: unknown; message?: unknown };
    return boundedProviderResponse(candidate.response ?? candidate.error ?? candidate.message);
  }
  return boundedProviderResponse(error);
}
