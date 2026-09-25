import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { hasStatus } from '../lib/httpError';

export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

/**
 * The single place an unhandled failure becomes an HTTP response.
 *
 * Express 5 forwards a rejected promise here on its own, which is why the
 * controllers carry no try/catch and never call next(err). That behaviour is
 * load-bearing: wrapping a handler in a catch that swallows the error would
 * silently turn a 500 into a hung request.
 *
 * `err` is genuinely unknown — anything can be thrown — so the status is read
 * through a guard rather than assumed. Errors carrying one come from
 * HttpError; see lib/httpError.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // Express identifies an error handler by its four-argument arity, so this
  // parameter is load-bearing even though it is never called.
  _next: NextFunction,
): void => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: err.message });
    return;
  }

  const status = hasStatus(err) ? err.status : 500;
  if (status >= 500) {
    console.error(err);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(status).json({ message: message || 'Internal server error' });
};
