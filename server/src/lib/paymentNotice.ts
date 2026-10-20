import type { Gig, Match, Payout, Transaction } from '../models';
import type { NotificationCategory } from '../types/domain';

interface Notice {
  userId: string;
  title: string;
  body: string;
  category: NotificationCategory;
}

/**
 * Who is told what when a Mobile Money payment settles.
 *
 * Every settlement path (the client's screen, the provider's callback, the
 * background status check, a simulated approval) announces through here, once,
 * so they cannot say different things about the same money.
 *
 * Paid: everyone with a payout is told their own share (the lead, and any crew
 * or apprentice). Failed: the worker, and the client, who may have closed the
 * page and needs to try again.
 */
export const paymentNotices = (
  tx: Transaction,
  match: Match & { gig?: Gig | null },
  payouts: Pick<Payout, 'userId' | 'amount' | 'currency'>[] = [],
): Notice[] => {
  const title = match.gig?.title ?? 'your job';

  if (tx.status !== 'confirmed') {
    const notices: Notice[] = [
      {
        userId: match.workerId,
        title: 'Payment not completed',
        body: `The client's Mobile Money payment for "${title}" did not go through. They have been asked to try again.`,
        category: 'critical',
      },
    ];
    if (match.gig?.clientId) {
      notices.push({
        userId: match.gig.clientId,
        title: 'Payment did not go through',
        body: `Your Mobile Money payment for "${title}" did not go through${tx.failureReason ? ` (${tx.failureReason})` : ''}. Open the job to try again.`,
        category: 'critical',
      });
    }
    return notices;
  }

  const shares = payouts.length
    ? payouts
    : [{ userId: match.workerId, amount: tx.releasedAmount ?? tx.amount, currency: tx.currency }];
  return shares.map((share) => ({
    userId: share.userId,
    title: 'You have been paid',
    body: `The client paid ${Number(share.amount).toLocaleString()} ${share.currency ?? tx.currency} for "${title}" with Mobile Money. Your receipt is in your wallet.`,
    // Money. The one notice a worker should never have to open the app to find.
    category: 'critical',
  }));
};
