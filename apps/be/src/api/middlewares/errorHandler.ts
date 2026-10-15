import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@ggaddak/shared';
import { ValidateError } from 'tsoa';
import { apiFailure, isV1Request } from '../../dto/api-response.dto.js';
import { AppError } from '../../errors/AppError.js';
import { AuthConfigurationError } from '../../errors/AuthConfigurationError.js';

const logger = createLogger('ERROR-HANDLER');

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (isV1Request(req.path)) {
    const status =
      err instanceof AppError ? err.statusCode : typeof err.status === 'number' ? err.status : 500;
    const validation = err instanceof ValidateError || err.type === 'entity.parse.failed';
    const code = validation
      ? 'VALIDATION_ERROR'
      : ((
          {
            400: 'BAD_REQUEST',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            422: 'VALIDATION_ERROR',
            429: 'RATE_LIMITED',
            503: 'SERVICE_UNAVAILABLE',
          } as Record<number, string>
        )[status] ?? 'INTERNAL_ERROR');
    if (status >= 500)
      logger.error(`[UnhandledError] ${err.message}`, { stack: err.stack, url: req.url });
    res
      .status(status)
      .json(
        apiFailure(
          code,
          validation
            ? 'Request validation failed'
            : status >= 500 && !(err instanceof AuthConfigurationError)
              ? 'Internal Server Error'
              : err.message,
          validation && err.fields ? err.fields : null,
        ),
      );
    return;
  }
  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.statusCode} - ${err.message}`, {
      details: err.details,
      url: req.url,
    });
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  // Handle generic error
  logger.error(`[UnhandledError] ${err.message}`, { stack: err.stack, url: req.url });
  const status = typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
}
