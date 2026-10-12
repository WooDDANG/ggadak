import type { AuthPrincipal } from '../services/auth.service.js';
declare global {
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}
export {};
