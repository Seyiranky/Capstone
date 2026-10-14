import crypto from 'crypto';
import type { EscrowStatus, MatchStatus } from '../types/domain';

/**
 * Pure payment rules, kept apart from the services so paymentService can apply
 * them inside its callback transaction without services importing each other.
 * Escrow states remain for payments made under the earlier escrow flow.
 */

const ALLOWED_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  none: ['held', 'released', 'refunded'],
  held: ['released', 'refunded'],
  released: [],
  refunded: [],
};

export const canEscrowTransition = (from: string, to: EscrowStatus): boolean =>
  ALLOWED_TRANSITIONS[from as EscrowStatus]?.includes(to) ?? false;

/**
 * Where money lands the moment it is collected, given where the job stands.
 *
 * Usually the job is still in progress and the money is held. But a client can
 * fund late: if the job was already completed the money goes straight to the
 * worker, and if it was called off it goes straight back.
 */
export const escrowStateOnFunding = (matchStatus: MatchStatus): EscrowStatus => {
  if (matchStatus === 'completed') return 'released';
  if (matchStatus === 'cancelled') return 'refunded';
  return 'held';
};

/** The timestamp column that records arrival in a given escrow state. */
export const escrowTimestampField = (
  state: EscrowStatus,
): 'heldAt' | 'releasedAt' | 'refundedAt' | null =>
  state === 'held'
    ? 'heldAt'
    : state === 'released'
      ? 'releasedAt'
      : state === 'refunded'
        ? 'refundedAt'
        : null;

// Crockford-style base32: no I, L, O or U, so a number read aloud or copied by
// hand from a printed receipt cannot be misread.
const RECEIPT_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A receipt number, e.g. ISK-7KQ2-M9XD.
 *
 * Random rather than sequential: the receipt page is public so a lender can
 * check it, and a sequence would let anyone walk every payout on the platform.
 * 40 bits is far beyond guessing.
 */
export const generateReceiptNumber = (): string => {
  const chars = [...crypto.randomBytes(8)].map((b) => RECEIPT_ALPHABET[b % 32]).join('');
  return `ISK-${chars.slice(0, 4)}-${chars.slice(4)}`;
};

/**
 * The agreed price is what the client pays: the worker's accepted quote, or the
 * gig's budget when there was no quote (ranked invitations, older matches).
 */
export const amountToCollect = (agreedAmount: number | string | null | undefined, budget: number | string): number =>
  agreedAmount != null ? Number(agreedAmount) : Number(budget);

/** Smallest and largest quote accepted, in RWF. The upper bound is the column's. */
export const QUOTE_MIN = 100;
export const QUOTE_MAX = 99_999_999;
export const QUOTE_NOTE_MAX = 280;
