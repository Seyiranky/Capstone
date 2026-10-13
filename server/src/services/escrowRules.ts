import type { EscrowStatus, MatchStatus } from '../types/domain';

/**
 * Pure escrow rules, kept apart from escrowService so paymentService can apply
 * them inside its callback transaction without the two services importing each
 * other.
 */

/** How long after the worker reports the job done the money moves on its own. */
export const AUTO_RELEASE_AFTER_MS = 72 * 60 * 60 * 1000;

/** Wrong completion codes allowed before the code stops working. */
export const MAX_CODE_ATTEMPTS = 5;

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
