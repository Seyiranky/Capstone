import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { requireEnv } from '../config/env';
import { secretMatches } from './secrets';

/**
 * Signed, expiring links for private uploads.
 *
 * Photos and voice notes sent in chat, and the evidence workers submit for
 * skill review, are stored under random names but would otherwise be served
 * to anyone holding the link. Instead the API signs each link when it hands
 * it to someone allowed to see the file, and the static server refuses any
 * request to these folders without a valid, unexpired signature.
 *
 * Links expire at the end of the next UTC day (24–48 hours), so the same file
 * keeps the same link for a day and browsers can cache it.
 */
const PRIVATE_DIRS = new Set(['messages', 'evidence', 'support']);
const DAY_MS = 24 * 60 * 60 * 1000;

const secret = () => process.env.UPLOAD_SIGNING_SECRET || requireEnv('JWT_SECRET');

const signature = (path: string, exp: number) =>
  crypto.createHmac('sha256', secret()).update(`${path}:${exp}`).digest('base64url').slice(0, 32);

const isPrivate = (path: string) => {
  const [, root, dir] = path.split('/');
  return root === 'uploads' && PRIVATE_DIRS.has(dir);
};

/** Adds a signature to a private upload's path; anything else is returned as it is. */
export const signUpload = (url: string | null | undefined): string | null => {
  if (!url) return url ?? null;
  if (!isPrivate(url) || url.includes('?')) return url;
  const exp = (Math.floor(Date.now() / DAY_MS) + 2) * DAY_MS;
  return `${url}?exp=${exp}&sig=${signature(url, exp)}`;
};

/** Mounted on /uploads, before the static files: private folders need a valid signature. */
export const protectPrivateUploads = (req: Request, res: Response, next: NextFunction): void => {
  const path = `${req.baseUrl}${req.path}`;
  if (!isPrivate(path)) {
    next();
    return;
  }
  const exp = Number(req.query.exp);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : undefined;
  if (!Number.isFinite(exp) || exp < Date.now() || !secretMatches(sig, signature(path, exp))) {
    res.status(403).json({ message: 'This link has expired or is not valid' });
    return;
  }
  next();
};
