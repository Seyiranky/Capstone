/**
 * An error carrying the status the API should answer with.
 *
 * The error middleware has always read `err.status || 500`, and the payment
 * service has always thrown `Object.assign(new Error(...), { status: 404 })` to
 * feed it. That worked but was invisible: nothing declared the contract, so
 * neither side could be checked against the other. This is the same behaviour
 * with a name.
 *
 * Express 5 forwards a rejected promise to the error middleware on its own,
 * which is why controllers throw these rather than calling next(err).
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** True when an unknown caught value carries a usable HTTP status. */
export const hasStatus = (err: unknown): err is { status: number; message?: string } =>
  typeof err === 'object' &&
  err !== null &&
  'status' in err &&
  typeof (err as { status: unknown }).status === 'number';
