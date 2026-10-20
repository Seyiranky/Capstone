import type { Request, Response } from 'express';
import { Match, Gig, Transaction, User } from '../models';
import * as paymentService from '../services/paymentService';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';
import { hasStatus } from '../lib/httpError';

/** A match with its gig loaded, which the party check reads. */
type MatchWithGig = Match & { gig?: Gig | null };

/** A transaction with its match and gig loaded. */
type TransactionWithMatch = Transaction & { match?: MatchWithGig | null };

const isPartyToMatch = (match: MatchWithGig | null | undefined, userId: string): boolean =>
  !!match && (match.workerId === userId || match.gig?.clientId === userId);

/**
 * The client pays for a finished job with Mobile Money: a payment request goes
 * to their MoMo number and they approve it on their phone. Body: matchId,
 * phone (their MoMo number), safetyNet (optional RWF added for the worker).
 */
export const payForJob = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const transaction = await paymentService.requestForMatch(String(req.body?.matchId ?? ''), caller.id, {
    payerMsisdn: req.body?.phone,
    safetyNet: req.body?.safetyNet,
  });
  res.status(201).json(transaction);
};

/**
 * Where a payment stands. While it waits on the payer, the provider is asked,
 * so the client's screen moves on the moment they approve on their phone.
 */
export const getTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const transaction = (await Transaction.findByPk(pathParam(req, 'id'), {
    include: [{ model: Match, as: 'match', include: [{ model: Gig, as: 'gig' }] }],
  })) as TransactionWithMatch | null;
  if (!transaction || (!isPartyToMatch(transaction.match, user.id) && user.role !== 'admin')) {
    res.status(404).json({ message: 'Payment not found' });
    return;
  }
  // Settling here also tells everyone concerned (paymentService.announce).
  res.json(await paymentService.refreshStatus(transaction, req));
};

/**
 * Approves a simulated payment at once, standing in for the payer approving it
 * on their phone. Only the simulated provider: a real MoMo payment is approved
 * by the payer with their PIN, never by the app.
 */
export const confirmTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const transaction = (await Transaction.findByPk(pathParam(req, 'id'), {
    include: [{ model: Match, as: 'match', include: [{ model: Gig, as: 'gig' }] }],
  })) as TransactionWithMatch | null;
  if (!transaction) {
    res.status(404).json({ message: 'Transaction not found' });
    return;
  }
  if (transaction.match?.gig?.clientId !== user.id) {
    res.status(403).json({ message: 'Only the client may confirm their payment' });
    return;
  }
  if (transaction.provider !== 'simulated-momo') {
    res.status(409).json({ message: 'Approve this payment on your phone; it confirms itself.' });
    return;
  }
  res.json(await paymentService.confirm(transaction.id, req));
};

/**
 * Records that a payment did not go through.
 *
 * paymentService.fail has existed since the first version with no way to reach
 * it, so a failed payment could only ever be left sitting as 'initiated'.
 */
export const failTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const transaction = (await Transaction.findByPk(pathParam(req, 'id'), {
    include: [{ model: Match, as: 'match', include: [{ model: Gig, as: 'gig' }] }],
  })) as TransactionWithMatch | null;
  if (!transaction) {
    res.status(404).json({ message: 'Transaction not found' });
    return;
  }
  if (!isPartyToMatch(transaction.match, user.id) && user.role !== 'admin') {
    res.status(403).json({
      message: 'Only the matched worker, the posting client or an admin may fail a payment',
    });
    return;
  }

  try {
    const failed = await paymentService.fail(transaction.id, req.body?.reason);
    res.json(failed);
  } catch (error) {
    const status = hasStatus(error) ? error.status : 500;
    res.status(status).json({ message: error instanceof Error ? error.message : 'Payment failed' });
  }
};

export const listTransactions = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const transactions = (await Transaction.findAll({
    include: [
      {
        model: Match,
        as: 'match',
        include: [
          { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
          { model: User, as: 'worker' },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  })) as TransactionWithMatch[];

  const visible = transactions.filter(
    (t) => isPartyToMatch(t.match, user.id) || user.role === 'admin',
  );
  res.json(visible);
};
