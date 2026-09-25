import type { AuthUser } from './domain';

/**
 * `verifyToken` attaches the caller to the request, and every guarded handler
 * reads it back. Declaring it here is what makes `req.user.id` and
 * `req.user.role` typed rather than `any` across the controllers.
 *
 * Optional on purpose: the same Request type flows through unauthenticated
 * routes (login, register, the payment webhook), so a handler that assumes a
 * caller has to say so. That is the point — the compiler now asks.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
