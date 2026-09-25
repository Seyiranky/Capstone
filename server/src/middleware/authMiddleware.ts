import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { User } from '../models';
import { jwtSecret } from '../config/env';
import type { AuthUser } from '../types/domain';

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
    decoded = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  // Checked on every request (not just at login) so a suspension takes effect
  // immediately for a worker/client who is already mid-session with a valid token.
  const user = await User.findByPk(decoded.id);
  if (!user) {
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
