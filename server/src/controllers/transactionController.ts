import type { Request, Response } from 'express';
import { Match, Gig, Transaction, User } from '../models';
import notify from '../lib/notify';
import { paymentNotice } from '../lib/paymentNotice';
import * as paymentService from '../services/paymentService';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';
import { hasStatus } from '../lib/httpError';

/** A match with its gig loaded, which the party check reads. */
type MatchWithGig = Match & { gig?: Gig | null };

const isPartyToMatch = (match: MatchWithGig | null | undefined, userId: string): boolean =>
  !!match && (match.workerId === userId || match.gig?.clientId === userId);

export const initiateTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const { matchId } = req.body ?? {};
  const match = (await Match.findByPk(matchId, {
    include: [{ model: Gig, as: 'gig' }],
  })) as MatchWithGig | null;
  if (!match) {
    res.status(404).json({ message: 'Match not found' });
    return;
  }
  if (!isPartyToMatch(match, user.id)) {
    res
      .status(403)
      .json({ message: 'Only the matched worker or the posting client may initiate payment' });
    return;
  }
  if (match.status !== 'completed') {
    res
      .status(409)
      .json({ message: 'A transaction can only be initiated for a completed match' });
    return;
  }

  const existing = await Transaction.findOne({ where: { matchId } });
  if (existing) {
    res
      .status(409)
      .json({ message: 'A transaction already exists for this match', transaction: existing });
    return;
  }

  const transaction = await paymentService.initiate(match, match.gig?.budget as number);
  res.status(201).json(transaction);
};

/** A transaction with its match and gig loaded. */
type TransactionWithMatch = Transaction & { match?: MatchWithGig | null };

export const confirmTransaction = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const transaction = (await Transaction.findByPk(pathParam(req, 'id'), {
    include: [{ model: Match, as: 'match', include: [{ model: Gig, as: 'gig' }] }],
  })) as TransactionWithMatch | null;
  if (!transaction) {
    res.status(404).json({ message: 'Transaction not found' });
    return;
  }
  if (!isPartyToMatch(transaction.match, user.id)) {
    res
      .status(403)
      .json({ message: 'Only the matched worker or the posting client may confirm payment' });
    return;
  }

  const confirmed = await paymentService.confirm(transaction.id);

  if (transaction.match) {
    await notify(req, paymentNotice(confirmed, transaction.match));
  }

  res.json(confirmed);
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
