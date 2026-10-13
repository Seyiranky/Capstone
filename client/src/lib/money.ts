import type { Role, Transaction } from '../types';

/**
 * What a transaction means for someone's totals, now that collected money can
 * sit in escrow.
 *
 * A worker has earned money only once it is released to them. A client has
 * paid as soon as it is collected, unless it came back to them.
 */
export const countsAsMoved = (tx: Transaction, role: Role | null | undefined): boolean => {
  if (tx.status !== 'confirmed') return false;
  if (role === 'client') return tx.escrowStatus !== 'refunded';
  return tx.escrowStatus === 'released';
};

export const isHeld = (tx: Transaction): boolean =>
  tx.status === 'confirmed' && tx.escrowStatus === 'held';

/** When money moved, for charts and feeds: release for workers, collection for clients. */
export const movedAt = (tx: Transaction, role: Role | null | undefined): string =>
  (role === 'client' ? tx.heldAt : tx.releasedAt) ?? tx.createdAt;

/** Wrong codes allowed before the server locks the code, matching MAX_CODE_ATTEMPTS. */
export const MAX_CODE_ATTEMPTS = 5;

/** The 72-hour window after the worker reports done, matching the server's AUTO_RELEASE_AFTER_MS. */
export const AUTO_RELEASE_AFTER_MS = 72 * 60 * 60 * 1000;
