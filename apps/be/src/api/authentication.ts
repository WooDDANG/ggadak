import type { Request } from 'express';
import { AuthService } from '../services/auth.service.js';

export async function expressAuthentication(request: Request, securityName: string) {
  return (request.app.locals.authService as AuthService).authenticate(request.headers.authorization);
}
