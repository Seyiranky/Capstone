import crypto from 'crypto';

/**
 * Compares two secrets without leaking their difference through timing.
 *
 * A webhook endpoint is public, so a naive === lets an attacker recover the
 * secret one character at a time by measuring how long rejection takes.
 */
export const secretMatches = (provided: string | undefined, expected: string): boolean => {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
