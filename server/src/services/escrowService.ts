import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, Match, Transaction, sequelize } from '../models';
import * as paymentService from './paymentService';
import * as trustScoreService from './trustScoreService';
import * as competenceService from './competenceService';
import notify from '../lib/notify';
import {
  AUTO_RELEASE_AFTER_MS,
  MAX_CODE_ATTEMPTS,
  canEscrowTransition,
  escrowTimestampField,
} from './escrowRules';
import type { CompletionMethod, EscrowStatus } from '../types/domain';

/**
 * Escrow: the client's money is collected when the worker accepts and held
 * until the job is done.
 *
 * Release has three routes, in the order they are meant to be used: the
 * completion code the client hands over on site, the client releasing it from
 * the app, and an automatic release 72 hours after the worker reports the job
 * done. The last stops a client holding money hostage by never answering.
 */

type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: Gig | null };

/** A 4-digit handover code. crypto, not Math.random: it guards money. */
export const generateCompletionCode = (): string =>
  String(crypto.randomInt(0, 10_000)).padStart(4, '0');

/**
 * Asks the client to fund the job, if they have not already.
 *
 * The transaction is unique per match, so a retried acceptance cannot open a
 * second collection.
 */
export const fund = async (match: Match, amount: number): Promise<Transaction> => {
  const existing = await Transaction.findOne({ where: { matchId: match.id } });
  if (existing) return existing;
  return paymentService.initiate(match, amount);
};

/** Moves a match's held money on, if it is held. Returns the escrow state reached, if any. */
const settleEscrow = async (
  matchId: string,
  to: Extract<EscrowStatus, 'released' | 'refunded'>,
): Promise<Transaction | null> =>
  sequelize.transaction(async (t) => {
    const tx = await Transaction.findOne({
      where: { matchId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    // Not yet funded (or failed): nothing is held. If funding arrives later,
    // escrowStateOnFunding sends it straight where the job now points.
    if (!tx || tx.status !== 'confirmed' || !canEscrowTransition(tx.escrowStatus, to)) return null;
    const field = escrowTimestampField(to);
    await tx.update({ escrowStatus: to, ...(field ? { [field]: new Date() } : {}) }, { transaction: t });
    return tx;
  });

export const refund = (matchId: string) => settleEscrow(matchId, 'refunded');

/**
 * Completes an accepted match and releases its escrow.
 *
 * The status change is a conditional update, so two routes racing (the worker
 * entering the code as the sweep runs) complete it once. Returns false if the
 * match was no longer accepted.
 */
export const completeMatch = async (
  ctx: AppContext,
  match: MatchWithGig,
  via: CompletionMethod,
): Promise<boolean> => {
  const [changed] = await Match.update(
    { status: 'completed', completedVia: via },
    { where: { id: match.id, status: 'accepted' } },
  );
  if (changed === 0) return false;

  const gig = match.gig ?? (await Gig.findByPk(match.gigId));
  const released = await settleEscrow(match.id, 'released');
  if (gig) {
    // A match accepted before escrow existed has no transaction yet; it is
    // paid the old way, requested on completion.
    await fund(match, Number(gig.budget));
    await gig.update({ status: 'completed' });
  }

  if (released) {
    await notify(ctx, {
      userId: match.workerId,
      title: 'Payment released',
      body: `${Number(released.amount).toLocaleString()} ${released.currency} for "${gig?.title ?? 'your job'}" is now yours.`,
      category: 'critical',
    });
  }
  if (gig && via !== 'client') {
    await notify(ctx, {
      userId: gig.clientId,
      title: 'Job completed',
      body:
        via === 'code'
          ? `"${gig.title}" was completed with your code and payment was released.`
          : `"${gig.title}" was completed automatically 72 hours after the worker finished.`,
      category: 'outcome',
    });
  }

  // Completion feeds the completion rate and can raise skill provenance, so
  // both are recomputed whichever route completed the job.
  await trustScoreService.recalculate(match.workerId, { trigger: 'match:completed' });
  if (gig) await trustScoreService.recalculate(gig.clientId, { trigger: 'match:completed' });
  await competenceService.recalculateAllFor(match.workerId, { trigger: 'match:completed' });
  return true;
};

export type CodeCheck = 'completed' | 'wrong' | 'locked' | 'notInProgress';

/**
 * Checks a completion code entered by the worker.
 *
 * Attempts are counted under a row lock so parallel guesses cannot each see a
 * fresh counter. After MAX_CODE_ATTEMPTS the code stops working and the client
 * has to release from the app, which is the point: 4 digits are guessable
 * only if guessing is free.
 */
export const checkCompletionCode = async (
  ctx: AppContext,
  matchId: string,
  code: string,
): Promise<{ result: CodeCheck; attemptsLeft: number }> => {
  const outcome = await sequelize.transaction(async (t) => {
    const match = await Match.scope('withCompletionCode').findByPk(matchId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!match || match.status !== 'accepted' || !match.completionCode) {
      return { result: 'notInProgress' as const, attemptsLeft: 0 };
    }
    if (match.completionCodeAttempts >= MAX_CODE_ATTEMPTS) {
      return { result: 'locked' as const, attemptsLeft: 0 };
    }
    const expected = Buffer.from(match.completionCode);
    const given = Buffer.from(String(code ?? '').trim().padEnd(expected.length).slice(0, expected.length));
    if (!crypto.timingSafeEqual(expected, given)) {
      const attempts = match.completionCodeAttempts + 1;
      await match.update({ completionCodeAttempts: attempts }, { transaction: t });
      return {
        result: attempts >= MAX_CODE_ATTEMPTS ? ('locked' as const) : ('wrong' as const),
        attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - attempts),
      };
    }
    return { result: 'completed' as const, attemptsLeft: MAX_CODE_ATTEMPTS - match.completionCodeAttempts };
  });

  if (outcome.result === 'completed') {
    const match = (await Match.findByPk(matchId, {
      include: [{ model: Gig, as: 'gig' }],
    })) as MatchWithGig | null;
    if (!match || !(await completeMatch(ctx, match, 'code'))) {
      return { result: 'notInProgress', attemptsLeft: 0 };
    }
  }
  return outcome;
};

/**
 * Releases every job whose worker reported it done more than 72 hours ago and
 * that the client has neither released nor disputed.
 *
 * Idempotent: completeMatch only acts on matches still accepted, so running the
 * sweep twice, or from two processes, releases each job once.
 */
export const releaseDue = async (ctx: AppContext, now: Date = new Date()): Promise<number> => {
  const due = (await Match.findAll({
    where: {
      status: 'accepted',
      workDoneAt: { [Op.lte]: new Date(now.getTime() - AUTO_RELEASE_AFTER_MS) },
    },
    include: [{ model: Gig, as: 'gig' }],
  })) as MatchWithGig[];
  let released = 0;
  for (const match of due) {
    if (await completeMatch(ctx, match, 'auto')) released += 1;
  }
  return released;
};
