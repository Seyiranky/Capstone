/**
 * Typed access to the environment.
 *
 * Two kinds of variable live here and they are read differently on purpose.
 *
 * **Secrets** are required. Reading one that is unset throws rather than
 * handing back `undefined`, which is what `jwt.verify(token, undefined)`
 * currently does — the server boots happily today with no JWT_SECRET and only
 * fails at the first login. `assertRequiredEnv()` is called once at boot so
 * that failure happens at start-up instead.
 *
 * **Tuning knobs** are read lazily, per call, and must stay that way. Five
 * integration tests assign `process.env.RANKED_INVITE_LIMIT` and
 * `EXPLORATION_SLOTS` at module scope *after* their imports have run; freezing
 * those into a config object at import time would silently ignore all of them
 * and the tests would pass while measuring the wrong thing.
 */

/** Reads a required variable, or explains precisely what is missing. */
export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in server/.env — see .env.example for the full list.`,
    );
  }
  return value;
};

/** Reads an optional variable, falling back when unset or empty. */
export const optionalEnv = (name: string, fallback: string): string =>
  process.env[name] || fallback;

/** Reads a numeric knob at call time, so tests can change it after import. */
export const numericEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Signing secret for API sessions. */
export const jwtSecret = (): string => requireEnv('JWT_SECRET');

export const jwtExpiresIn = (): string => optionalEnv('JWT_EXPIRES_IN', '7d');

/**
 * Signs skill passports and income statements. Kept separate from the session
 * secret because a passport is a long-lived public credential: leaking one
 * must not also hand over the ability to mint sessions. Falls back to
 * JWT_SECRET, which is how the running deployment is configured today.
 */
export const passportSigningSecret = (): string =>
  process.env.PASSPORT_SIGNING_SECRET || requireEnv('JWT_SECRET');

/**
 * Fails at boot rather than at the first request that needs a secret.
 * Called from server.ts only — importing this module must stay side-effect
 * free so the test suite can import the app without a full environment.
 */
export const assertRequiredEnv = (): void => {
  requireEnv('JWT_SECRET');
};
