import type { Request } from 'express';
import type { AuthPrincipal } from '../../dto/auth.dto.js';
import type { AuthService } from '../../services/auth.service.js';
import { AuthError } from '../../errors/AuthError.js';

export function requirePrincipal(request: Request): AuthPrincipal {
  if (!request.user) throw new AuthError();
  return request.user;
}

/** Check every referenced Decision Record, including a replacement predecessor. */
export async function authorizeDecisions(
  auth: AuthService,
  request: Request,
  guildId: string,
  ids: string[],
): Promise<AuthPrincipal> {
  const principal = requirePrincipal(request);
  for (const id of new Set(ids)) await auth.requireDecision(principal, id, guildId);
  return principal;
}
