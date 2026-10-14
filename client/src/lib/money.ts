import type { Match, Role, Transaction } from '../types';

/**
 * What a payment means for someone's totals.
 *
 * Clients pay with Mobile Money once a job is done, so a confirmed payment is
 * money moved for both sides: paid by the client, received by the worker.
 */
export const countsAsMoved = (tx: Transaction, role: Role | null | undefined): boolean => {
  if (tx.status !== 'confirmed') return false;
  return role === 'client' ? true : tx.escrowStatus === 'released';
};

/** When money moved, for charts and feeds. */
export const movedAt = (tx: Transaction): string => tx.releasedAt ?? tx.createdAt;

/** The price due on a job: the agreed amount, or the gig's budget. */
export const priceOf = (m: Match): number => Number(m.agreedAmount ?? m.gig?.budget ?? 0);

/**
 * Finished jobs not paid yet, and what they come to: for a client what they
 * owe, for a worker what they are owed (jobs they lead).
 */
export const awaitingPayment = (matches: Match[], role: Role | null | undefined, userId?: string) => {
  const due = matches.filter(
    (m) =>
      m.status === 'completed' &&
      m.transaction?.status !== 'confirmed' &&
      (role !== 'worker' || m.workerId === userId),
  );
  return { count: due.length, amount: due.reduce((sum, m) => sum + priceOf(m), 0) };
};

/** A payment's state in words people use: paid, waiting for approval, failed. */
export const paymentLabel = (tx: Transaction): string =>
  tx.status === 'confirmed' ? 'paid' : tx.status === 'initiated' ? 'awaiting_approval' : 'failed';
