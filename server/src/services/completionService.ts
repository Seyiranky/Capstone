import type { Request } from 'express';
import { Op } from 'sequelize';
import { Dispute, Gig, Match, Transaction, sequelize } from '../models';
import * as payoutService from './payoutService';
import * as trustScoreService from './trustScoreService';
import * as competenceService from './competenceService';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import { amountToCollect, generateReceiptNumber } from './escrowRules';
import type { CompletionMethod, DisputeOutcome } from '../types/domain';

/**
 * Finishing a job.
 *
 * Isoko does not hold money: the client marks the job done (or a dispute
 * decides it), and then pays the worker with Mobile Money from the job card
 * (paymentService.requestForMatch). Completion feeds the trust score and the
 * skill evidence, whichever way it happened.
 */
type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: Gig | null };

/** Disputes that are still being decided. */
const LIVE_DISPUTE = ['open', 'escalated'];

export const hasLiveDispute = async (matchId: string): Promise<boolean> =>
  (await Dispute.count({ where: { matchId, status: LIVE_DISPUTE } })) > 0;

/** Closes a live dispute the parties settled themselves (the job finished or called off). */
export const settleLiveDispute = async (matchId: string, outcome: DisputeOutcome): Promise<void> => {
  await Dispute.update(
    { status: 'settled', outcome, decidedBy: 'parties', decidedAt: new Date() },
    { where: { matchId, status: LIVE_DISPUTE } },
  );
};

/**
 * Money a client paid in advance under the old escrow flow, for a job that was
 * still in progress when Isoko moved to paying at the end. Finishing the job
 * pays it out (with a receipt), calling it off returns it, so none is left
 * held for ever.
 */
export const settleLegacyHold = async (matchId: string, to: 'released' | 'refunded', share = 1) =>
  sequelize.transaction(async (t) => {
    const tx = await Transaction.findOne({ where: { matchId, status: 'confirmed', escrowStatus: 'held' }, lock: t.LOCK.UPDATE, transaction: t });
    if (!tx) return null;
    if (to === 'refunded') return tx.update({ escrowStatus: 'refunded', refundedAt: new Date() }, { transaction: t });
    await tx.update(
      {
        escrowStatus: 'released',
        releasedAt: new Date(),
        receiptNumber: generateReceiptNumber(),
        ...(share < 1 ? { releasedAmount: Math.round(Number(tx.amount) * share) } : {}),
      },
      { transaction: t },
    );
    await payoutService.createFor(tx, t);
    return tx;
  });

/** What the worker is owed or was paid for a job: the agreed price, or the share a dispute decided. */
export const priceOf = (match: Pick<Match, 'agreedAmount'>, gig: Pick<Gig, 'budget'>): number =>
  amountToCollect(match.agreedAmount, gig.budget);

/**
 * Marks an accepted job done. A conditional update, so two routes racing
 * complete it once; returns false if it was no longer in progress.
 *
 * `share` below 1 (a split dispute decision) lowers the price due to that
 * share of the agreed amount.
 */
export const completeMatch = async (
  ctx: AppContext,
  match: MatchWithGig,
  via: CompletionMethod,
  { share = 1 }: { share?: number } = {},
): Promise<boolean> => {
  const gig = match.gig ?? (await Gig.findByPk(match.gigId));
  const due = gig ? Math.round(priceOf(match, gig) * share) : null;
  const [changed] = await Match.update(
    {
      status: 'completed',
      completedVia: via,
      completedAt: new Date(),
      ...(share < 1 && due != null ? { agreedAmount: due } : {}),
    },
    { where: { id: match.id, status: 'accepted' } },
  );
  if (changed === 0) return false;

  await settleLegacyHold(match.id, 'released', share);
  if (via === 'client') await settleLiveDispute(match.id, 'release');
  if (gig) {
    await gig.update({ status: 'completed' });
    // A dispute decision is announced by the dispute service, with its reasons.
    if (via === 'client') {
      await notify(ctx, {
        userId: match.workerId,
        title: 'Job marked done',
        body: `The client marked "${gig.title}" as done. They will now pay you ${due?.toLocaleString()} RWF with Mobile Money.`,
        category: 'outcome',
      });
    }
  }

  // Completion feeds the completion rate and can raise skill provenance.
  await trustScoreService.recalculate(match.workerId, { trigger: 'match:completed' });
  if (gig) await trustScoreService.recalculate(gig.clientId, { trigger: 'match:completed' });
  await competenceService.recalculateAllFor(match.workerId, { trigger: 'match:completed' });
  return true;
};

export const WORK_DONE_REMINDER_MS = 48 * 60 * 60 * 1000;

/**
 * The worker says the work is finished.
 *
 * Only the client can mark a job done (it is their word the work was delivered,
 * and it asks them to pay), so the worker's side is to tell them. Saying it
 * twice changes nothing; the client is told once.
 */
export const reportWorkDone = async (ctx: AppContext, match: MatchWithGig, workerId: string) => {
  if (match.workerId !== workerId) throw new HttpError('Only the worker on this job can say the work is finished', 403);
  if (match.status !== 'accepted') throw new HttpError('Only a job in progress can be reported finished', 409);
  if (match.workDoneAt) return match;
  await match.update({ workDoneAt: new Date() });
  const gig = match.gig ?? (await Gig.findByPk(match.gigId));
  if (gig) {
    await notify(ctx, {
      userId: gig.clientId,
      title: 'Work finished',
      body: `The worker says "${gig.title}" is finished. Check it, then mark the job as done and pay with Mobile Money.`,
      category: 'outcome',
    });
  }
  return match;
};

/**
 * Reminds a client, once, when the worker said the work was finished 48 hours
 * ago and the job is still not marked done. Run by the server's sweep.
 */
export const remindWorkDone = async (ctx: AppContext, now = new Date()): Promise<number> => {
  const due = (await Match.findAll({
    where: {
      status: 'accepted',
      workDoneAt: { [Op.lte]: new Date(now.getTime() - WORK_DONE_REMINDER_MS) },
      workDoneRemindedAt: null,
    },
    include: [{ model: Gig, as: 'gig' }],
  })) as MatchWithGig[];
  for (const match of due) {
    // Claim the reminder first, so two sweeps cannot both send it.
    const [claimed] = await Match.update(
      { workDoneRemindedAt: now },
      { where: { id: match.id, workDoneRemindedAt: null } },
    );
    if (!claimed || !match.gig) continue;
    await notify(ctx, {
      userId: match.gig.clientId,
      title: 'Waiting for you to mark the job done',
      body: `The worker finished "${match.gig.title}" two days ago. Mark it done and pay, or open a dispute if something is wrong.`,
      category: 'outcome',
    });
  }
  return due.length;
};
