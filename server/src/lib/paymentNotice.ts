import type { Gig, Match, Transaction } from '../models';
import type { NotificationCategory } from '../types/domain';

/**
 * What to tell people when a payment settles.
 *
 * With escrow, "confirmed" stopped meaning "the worker has been paid": it means
 * the client's money was collected, and where it went depends on the job. The
 * webhook and the in-app confirmation both describe it through here, so the
 * two routes cannot drift into saying different things about the same money.
 */
export const paymentNotice = (
  tx: Transaction,
  match: Match & { gig?: Gig | null },
): { userId: string; title: string; body: string; category: NotificationCategory } => {
  const title = match.gig?.title ?? 'your job';
  const amount = `${Number(tx.amount).toLocaleString()} ${tx.currency}`;

  if (tx.status !== 'confirmed') {
    return {
      userId: match.workerId,
      title: 'Payment failed',
      body: `Payment for "${title}" did not go through. ${tx.failureReason ?? ''}`.trim(),
      category: 'critical',
    };
  }
  if (tx.escrowStatus === 'refunded' && match.gig) {
    return {
      userId: match.gig.clientId,
      title: 'Payment refunded',
      body: `${amount} for "${title}" was returned to you because the job was called off.`,
      category: 'critical',
    };
  }
  if (tx.escrowStatus === 'released') {
    return {
      userId: match.workerId,
      title: 'Payment released',
      body: `${amount} for "${title}" is now yours.`,
      category: 'critical',
    };
  }
  return {
    userId: match.workerId,
    title: 'Payment secured',
    body: `${amount} for "${title}" is held in escrow. It is released to you when the job is done.`,
    // Money. The one notice a worker should never have to open the app to find.
    category: 'critical',
  };
};
