import type { Gig, Match, Transaction } from '../models';
import type { NotificationCategory } from '../types/domain';

/**
 * What to tell the worker when a Mobile Money payment settles.
 *
 * The provider's callback, the status check and the in-app confirmation all
 * describe it through here, so they cannot say different things about the
 * same money.
 */
export const paymentNotice = (
  tx: Transaction,
  match: Match & { gig?: Gig | null },
): { userId: string; title: string; body: string; category: NotificationCategory } => {
  const title = match.gig?.title ?? 'your job';
  const amount = `${Number(tx.releasedAmount ?? tx.amount).toLocaleString()} ${tx.currency}`;

  if (tx.status !== 'confirmed') {
    return {
      userId: match.workerId,
      title: 'Payment not completed',
      body: `The client's Mobile Money payment for "${title}" did not go through. They have been asked to try again.`,
      category: 'critical',
    };
  }
  return {
    userId: match.workerId,
    title: 'You have been paid',
    body: `The client paid ${amount} for "${title}" with Mobile Money. Your receipt is in your wallet.`,
    // Money. The one notice a worker should never have to open the app to find.
    category: 'critical',
  };
};
