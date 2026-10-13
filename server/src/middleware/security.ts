import type { Request } from 'express';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { optionalEnv } from '../config/env';

/**
 * The web origins allowed to call the API and open a socket: the app itself
 * (APP_URL) plus any extra listed in CORS_ORIGINS, comma-separated.
 */
export const allowedOrigins = (): string[] => [
  ...new Set(
    [optionalEnv('APP_URL', 'http://localhost:5173'), ...(process.env.CORS_ORIGINS ?? '').split(',')]
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ),
];

export const corsOptions: CorsOptions = {
  // Requests without an Origin (curl, server-to-server webhooks, the test
  // suite) are not browser cross-site calls, so CORS has nothing to protect.
  origin: (origin, cb) => cb(null, !origin || allowedOrigins().includes(origin)),
};

/**
 * Standard security headers. Uploaded images and audio are loaded by the web
 * app from another origin, so resources may be embedded cross-origin; the API
 * serves no HTML, so its content policy forbids everything.
 */
export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
});

// ── Rate limits ──────────────────────────────────────────────────────────────
// Off under the test suite, which logs in hundreds of times from one address,
// unless a test turns them on to check them.
const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1';

const limiter = (opts: Partial<Options> & { message: string }) =>
  rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipInTests,
    ...opts,
    message: { message: opts.message },
  });

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
const ipAndEmail = (req: Request) =>
  `${ip(req)}|${String(req.body?.email ?? '').trim().toLowerCase()}`;

const MINUTE = 60 * 1000;

/** Failed logins: 10 per account per address in 15 minutes. Successful ones are not counted. */
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: ipAndEmail,
  message: 'Too many failed attempts. Wait 15 minutes and try again.',
});

/** New accounts: 10 per address an hour. */
export const signupLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  keyGenerator: ip,
  message: 'Too many accounts created from this connection. Try again later.',
});

/** Password resets and verification emails: 5 per address in 15 minutes. */
export const emailLinkLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 5,
  keyGenerator: ipAndEmail,
  message: 'Too many requests. Wait a few minutes and try again.',
});

/** SMS codes cost money and reach a real phone: 5 per signed-in user an hour. */
export const smsCodeLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 5,
  keyGenerator: (req) => (req as Request & { user?: { id: string } }).user?.id ?? ip(req),
  message: 'Too many codes requested. Try again in an hour.',
});
