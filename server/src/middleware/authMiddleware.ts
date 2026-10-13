import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { User } from '../models';
import { jwtSecret } from '../config/env';
import type { AuthUser } from '../types/domain';

/**
 * A session is refused once the password has changed after it was issued, so
 * changing or resetting a password signs out every other device. Compared in
 * whole seconds, as `iat` is: the session issued with the change survives it.
 */
export const sessionStillValid = (user: User, decoded: jwt.JwtPayload): boolean =>
  !user.passwordChangedAt || (decoded.iat ?? 0) >= Math.floor(user.passwordChangedAt.getTime() / 1000);

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = header.split(' ')[1];
  let decoded: jwt.JwtPayload;
  try {
    // jwt.verify widens to string | JwtPayload; every token this API issues is
    // a payload, and a bare string would fail the id lookup below regardless.
    decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  // Checked on every request (not just at login) so a suspension takes effect
  // immediately for a worker/client who is already mid-session with a valid token.
  const user = await User.findByPk(decoded.id);
  if (!user || !sessionStillValid(user, decoded)) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }
  if (user.status === 'suspended') {
    res.status(403).json({
      message: 'This account has been suspended. Contact an administrator.',
      code: 'ACCOUNT_SUSPENDED',
    });
    return;
  }

  // Role and reviewer capability are taken from the record rather than the
  // token, for the same reason the suspension check is: a change applies to a
  // session already in flight, and a token issued before enrolment still works.
  req.user = { ...decoded, role: user.role, reviewerTier: user.reviewerTier } as AuthUser;
  next();
};

/**
 * For public routes that show more to a signed-in caller: sets req.user when a
 * valid token is sent and carries on without one otherwise. A bad or expired
 * token is treated as no token, never as an error, since the route is public.
 */
export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(header.split(' ')[1], jwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const user = await User.findByPk(decoded.id);
      if (user && user.status !== 'suspended' && sessionStillValid(user, decoded)) {
        req.user = { ...decoded, role: user.role, reviewerTier: user.reviewerTier } as AuthUser;
      }
    } catch {
      // Public route: an unusable token just means an anonymous caller.
    }
  }
  next();
};

/**
 * Doing business needs a confirmed email or phone, so a throwaway account
 * cannot post gigs or apply for work. Off under the test suite, whose fixture
 * users are created unconfirmed, unless a test turns it on to check it.
 */
export const requireConfirmedContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (process.env.NODE_ENV === 'test' && process.env.CONTACT_GATE_IN_TESTS !== '1') {
    next();
    return;
  }
  const user = req.user ? await User.findByPk(req.user.id) : null;
  if (!user?.emailVerifiedAt && !user?.phoneVerifiedAt) {
    res.status(403).json({
      message: 'Confirm your email or phone number in Settings before posting gigs or applying for work.',
      code: 'CONTACT_NOT_CONFIRMED',
    });
    return;
  }
  next();
};
