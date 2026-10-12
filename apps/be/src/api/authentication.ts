import { timingSafeEqual } from 'node:crypto';
import { AuthError } from '../services/auth.service.js';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service.js';

export async function expressAuthentication(request: Request, securityName: string) {
  if (securityName === 'service') {
    const configured = request.app.locals.serviceToken as string | undefined;
    const actual = request.headers.authorization?.replace(/^Bearer /, '');
    if (
      !configured ||
      !actual ||
      !request.headers.authorization?.startsWith('Bearer ') ||
      Buffer.byteLength(actual) !== Buffer.byteLength(configured) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(configured))
    )
      throw new AuthError('Bot service authentication required');
    return {};
  }
  return (request.app.locals.authService as AuthService).authenticate(
    request.headers.authorization,
  );
}
