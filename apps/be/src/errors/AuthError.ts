import { AppError } from './AppError.js';
export class AuthError extends AppError {
  constructor(message = 'Authentication required', status = 401) {
    super(message, status);
  }
}
