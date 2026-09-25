import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '../types/domain';

export const authorize = (...allowedRoles: Role[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  };
};

/**
 * Gates routes on the reviewer capability rather than on `role`.
 *
 * Peer reviewers are workers, so a role check would exclude them and leave the
 * reviewer pool too small for rotation to mean anything.
 */
export const requireReviewer: RequestHandler = (req, res, next) => {
  if (!req.user?.reviewerTier) {
    res.status(403).json({ message: 'You are not enrolled as a reviewer' });
    return;
  }
  next();
};
