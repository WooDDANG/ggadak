import { DeliveryErrorCategory } from '@ggaddak/shared';
import type { AnalysisFailure } from '../domain/analysis-workflow.js';
import { AppError } from './AppError.js';

/** Capacity contention is retryable without consuming a provider attempt. */
export class AnalysisBusyError extends AppError {
  readonly status = 503;

  constructor(message = 'Analysis capacity busy') {
    super(message, 503);
  }
}

/** Shared retry policy for request execution and the durable Analysis Queue. */
export function classifyAnalysisError(error: unknown) {
  const status =
    error instanceof AppError
      ? error.statusCode
      : ((error as { status?: number } | null)?.status ?? 500);
  const retryable = status >= 500 || status === 429 || status === 408;
  const busy = error instanceof AnalysisBusyError;
  const retryAfter = Number(error instanceof AppError ? error.details?.retryAfterMs : 0);
  return {
    status,
    retryable,
    busy,
    retryAfterMs: Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0,
    category: busy
      ? DeliveryErrorCategory.AnalysisCapacity
      : retryable
        ? DeliveryErrorCategory.ProviderOrStorage
        : DeliveryErrorCategory.AnalysisTerminal,
  };
}

export function analysisFailure(error: unknown): AnalysisFailure {
  const { status, retryable } = classifyAnalysisError(error);
  return {
    category: status === 422 ? 'validation-or-budget' : DeliveryErrorCategory.ProviderOrStorage,
    message:
      status === 422
        ? 'Analysis requires a new manual reanalysis'
        : 'Analysis temporarily unavailable',
    status,
    retryable,
  };
}
