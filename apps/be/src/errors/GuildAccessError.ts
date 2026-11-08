import { AppError } from './AppError.js';

/** Distinguishes permission recovery from unrelated domain/provider API failures. */
export class GuildAccessError extends AppError {
  constructor(message = 'Guild access denied', status = 403, details?: any) {
    super(message, status, details);
  }
}
