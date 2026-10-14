import type { Request } from 'express';
import { Dispute, Gig, Match } from '../models';
import * as trustScoreService from './trustScoreService';
import * as competenceService from './competenceService';
import notify from '../lib/notify';
import { amountToCollect } from './escrowRules';
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
