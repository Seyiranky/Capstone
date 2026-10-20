import type { Request, Response } from 'express';
import { Gig, Match, Payout, Skill, Transaction, User } from '../models';
import { pathParam } from '../lib/query';

type ReceiptRow = Payout & {
  transaction?: Transaction | null;
  user?: User | null;
  match?: (Match & { gig?: (Gig & { client?: User | null; skill?: Skill | null }) | null }) | null;
};

/**
 * A payout receipt, readable by anyone holding its number.
 *
 * Public on purpose: a lender or a SACCO given a printed receipt or an income
 * statement line checks it here, against Isoko's own record, without an
 * account. It shows names and the job, never contact details, and the number
 * is random so receipts cannot be enumerated. On a crew job each person has
 * their own receipt for their own share.
 */
export const getReceipt = async (req: Request, res: Response): Promise<void> => {
  const number = pathParam(req, 'number').toUpperCase();
  const payout = (await Payout.findOne({
    where: { receiptNumber: number },
    include: [
      { model: Transaction, as: 'transaction' },
      { model: User, as: 'user', attributes: ['name'] },
      {
        model: Match,
        as: 'match',
        include: [
          {
            model: Gig,
            as: 'gig',
            include: [
              { model: User, as: 'client', attributes: ['name'] },
              { model: Skill, as: 'skill', attributes: ['name'] },
            ],
          },
        ],
      },
    ],
  })) as ReceiptRow | null;

  if (!payout || payout.transaction?.escrowStatus !== 'released') {
    res.status(404).json({ message: 'No receipt with that number' });
    return;
  }

  res.json({
    number: payout.receiptNumber,
    amount: Number(payout.amount),
    currency: payout.currency,
    releasedAt: payout.releasedAt,
    role: payout.role,
    paymentReference: payout.transaction.reference,
    provider: payout.transaction.provider,
    // MTN's own id for the money movement, the one on the payer's MoMo
    // confirmation: anyone can check this payment against MTN's records (NFR-8).
    providerTransactionId:
      (payout.transaction.providerRawResponse as { financialTransactionId?: string } | null)?.financialTransactionId ??
      null,
    completedVia: payout.match?.completedVia ?? null,
    gig: payout.match?.gig?.title ?? null,
    skill: payout.match?.gig?.skill?.name ?? null,
    worker: payout.user?.name ?? null,
    client: payout.match?.gig?.client?.name ?? null,
    cover: payout.transaction.coverPolicyNumber
      ? { policyNumber: payout.transaction.coverPolicyNumber, premium: Number(payout.transaction.coverPremium) }
      : null,
  });
};
