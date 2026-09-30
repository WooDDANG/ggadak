import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@ggaddak/shared';
import { AppError } from '../../errors/AppError.js';

const logger = createLogger('ERROR-HANDLER');

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.statusCode} - ${err.message}`, { details: err.details, url: req.url });
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
