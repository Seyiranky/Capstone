import type { Request } from 'express';
import type { AuthUser } from '../types/domain';
import { HttpError } from './httpError';

/**
 * The caller, on a route that requires one.
 *
 * `req.user` is optional on the Request type because the same type flows
 * through login, register and the payment webhook, none of which have a
 * caller. Handlers behind verifyToken do have one, and this is how they say
 * so — once, at the top — instead of asserting it at every field access.
 *
 * The throw is not decoration. If a guarded route is ever mounted without
 * verifyToken in front of it, this answers 401 rather than reading `id` off
 * undefined and returning a 500 that says nothing about the cause.
 */
export const authed = (req: Request): AuthUser => {
  if (!req.user) {
    throw new HttpError('Not authenticated', 401);
  }
  return req.user;
};
