import type { Request, Response } from 'express';
import { Gig, Match, Skill, Transaction, User } from '../models';
import { pathParam } from '../lib/query';

type ReceiptRow = Transaction & {
  match?: (Match & { gig?: (Gig & { client?: User | null; skill?: Skill | null }) | null; worker?: User | null }) | null;
};

/**
 * A payout receipt, readable by anyone holding its number.
 *
 * Public on purpose: a lender or a SACCO given a printed receipt or an income
 * statement line checks it here, against Isoko's own record, without an
 * account. It shows names and the job, never contact details, and the number
 * is random so receipts cannot be enumerated.
 */
export const getReceipt = async (req: Request, res: Response): Promise<void> => {
  const number = pathParam(req, 'number').toUpperCase();
  const tx = (await Transaction.findOne({
    where: { receiptNumber: number },
    include: [
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
          { model: User, as: 'worker', attributes: ['name'] },
        ],
      },
    ],
  })) as ReceiptRow | null;

  if (!tx || tx.escrowStatus !== 'released') {
    res.status(404).json({ message: 'No receipt with that number' });
    return;
  }

  res.json({
    number: tx.receiptNumber,
    amount: Number(tx.releasedAmount ?? tx.amount),
    currency: tx.currency,
    releasedAt: tx.releasedAt,
    paymentReference: tx.reference,
    provider: tx.provider,
    completedVia: tx.match?.completedVia ?? null,
    gig: tx.match?.gig?.title ?? null,
    skill: tx.match?.gig?.skill?.name ?? null,
    worker: tx.match?.worker?.name ?? null,
    client: tx.match?.gig?.client?.name ?? null,
  });
};
