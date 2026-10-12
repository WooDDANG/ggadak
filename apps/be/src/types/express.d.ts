import type { AuthPrincipal } from '../dto/auth.dto.js';
declare global {
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}
export {};
