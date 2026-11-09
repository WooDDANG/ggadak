import { AppError } from './AppError.js';

export type AiFailureKind =
  | 'timeout'
  | 'rate-limit'
  | 'provider'
  | 'graph-structure'
  | 'semantic-verification'
  | 'configuration';

const summaries: Record<AiFailureKind, string> = {
  timeout: 'AI call timed out',
  'rate-limit': 'AI provider rate limit reached',
  provider: 'AI provider failed',
  'graph-structure': 'AI graph structure was invalid',
  'semantic-verification': 'AI verification failed',
  configuration: 'AI configuration was invalid',
};

export function classifyAiFailure(error: unknown, stage: string) {
  const status =
    error instanceof AppError
      ? error.statusCode
      : typeof (error as { status?: unknown } | null)?.status === 'number'
        ? (error as { status: number }).status
        : 500;
  const message = error instanceof Error ? error.message : String(error);
  const explicitKind = error instanceof AppError ? error.details?.failureKind : undefined;
  let kind: AiFailureKind = 'provider';
  if (explicitKind === 'graph-structure' || explicitKind === 'semantic-verification')
    kind = explicitKind;
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
    retryable: status === 408 || status === 429 || status >= 500,
  };
}

/** Provider diagnostics are kept in the database, never in Loki. */
export function boundedProviderResponse(value: unknown): string | undefined {
  if (value == null) return undefined;
  let raw: string;
  try {
    raw = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  const redacted = raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:api[_-]?key|authorization|token|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      '$1[REDACTED]',
    );
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
