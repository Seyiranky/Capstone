import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, GigApplication, Match, User, sequelize } from '../models';
import * as teamService from './teamService';
import * as trustScoreService from './trustScoreService';
import * as completionService from './completionService';
import { canApply } from './applicationEligibility';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import type { MatchStatus } from '../types/domain';

/**
 * Changing a match's status: a worker accepting or declining an invitation,
 * and either side calling off a job.
 *
 * Every database write for one change happens in a single transaction, so an
 * acceptance cannot leave the gig matched while the other invitations are
 * still pending, and two workers accepting the same gig at once cannot both
 * win: the gig row is locked while the "already taken" check runs.
 * Notifications and trust-score updates go out only after the commit, so
 * nobody is told about a change that was rolled back.
 */
type AppContext = Pick<Request, 'app'> | undefined;

export interface StatusChange {
  status?: unknown;
  declineReason?: string;
  occurredAt?: string;
  queuedOffline?: boolean;
}

const ALLOWED_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Whether a state change is permitted.
 *
 * The table is exhaustive over MatchStatus, so a new state fails to compile
 * until its transitions are declared. `status` arrives from the request body
 * and is not yet narrowed.
 */
export const canTransition = (from: string, to: unknown): to is MatchStatus =>
  ALLOWED_TRANSITIONS[from as MatchStatus]?.includes(to as MatchStatus) ?? false;

/**
 * When the worker acted, if the app recorded it offline. Only trusted for
 * actions that were genuinely queued offline, and never in the future or
 * older than the match itself: a phone's clock is not an authority.
 */
const occurredTime = (match: Match, change: StatusChange, now: Date): Date | null => {
  const claimed = change.occurredAt ? new Date(change.occurredAt) : null;
  return change.queuedOffline && claimed && !Number.isNaN(claimed.getTime()) && claimed <= now && claimed >= match.createdAt
    ? claimed
    : null;
};

type Notice = Parameters<typeof notify>[1];

/** Applies a status change for the caller. Returns the match id. */
export const changeStatus = async (
  ctx: AppContext,
  matchId: string,
  callerId: string,
  change: StatusChange,
): Promise<string> => {
  const { status, declineReason } = change;
  const found = (await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] })) as
    | (Match & { gig?: Gig | null })
    | null;
  if (!found) throw new HttpError('Match not found', 404);

  const isWorker = found.workerId === callerId;
  const isClient = found.gig?.clientId === callerId;
  if (!isWorker && !isClient) {
    throw new HttpError('Only the matched worker or the posting client may update this match', 403);
  }
  if (!canTransition(found.status, status)) {
    throw new HttpError(`Cannot transition match from '${found.status}' to '${status}'`, 409);
  }
  // Acceptance is the worker's own signal; a client accepting on their behalf
  // would make the acceptance rate meaningless as a measure.
  if (status === 'accepted' && !isWorker) {
    throw new HttpError('Only the matched worker may accept this match', 403);
  }
  // The rules for applying hold when accepting too: a gig marked sensitive
  // after the invitation went out cannot be taken by someone who no longer qualifies.
  if (status === 'accepted' && found.gig) {
    const worker = await User.findByPk(callerId);
    const allowed = worker ? await canApply(found.gig, worker) : null;
    if (allowed && !allowed.eligible) {
      throw new HttpError('You do not meet the requirements for this gig any more', 403, {
        code: 'NOT_ELIGIBLE',
        missing: allowed.missing,
      });
    }
  }
  // Calling off a job under way while a dispute is open would pre-empt the
  // mediators, who decide what happens to it.
  if (status === 'cancelled' && found.status === 'accepted' && (await completionService.hasLiveDispute(found.id))) {
    throw new HttpError('A dispute is open on this job. The mediators decide what happens to it.', 409);
  }
  // Marking the job done is the client's word that the work was delivered, and
  // it is what asks them to pay, so only the client may do it.
  if (status === 'completed') {
    if (!isClient) throw new HttpError('Only the client may mark this job as done', 403);
    // The client marks the job done; they then pay the worker with Mobile Money.
    await completionService.completeMatch(ctx, found, 'client');
    return found.id;
  }

  const notices: Notice[] = [];
  let crewInvited: Awaited<ReturnType<typeof teamService.createCrewInvites>> = [];
  let gigTitle: string | undefined;

  await sequelize.transaction(async (t) => {
    // Re-read under lock: the checks above ran outside the transaction, and the
    // gig row is what two simultaneous acceptances would both be racing for.
    const gig = found.gig ? await Gig.findByPk(found.gig.id, { lock: t.LOCK.UPDATE, transaction: t }) : null;
    const match = await Match.findByPk(found.id, { lock: t.LOCK.UPDATE, transaction: t });
    if (!match) throw new HttpError('Match not found', 404);
    if (!canTransition(match.status, status)) {
      throw new HttpError(`Cannot transition match from '${match.status}' to '${status}'`, 409);
    }
    gigTitle = gig?.title;

    // A gig is done once. A stray invitation must not be accepted on a gig that
    // someone else has already taken, or the client would pay for it twice.
    if (
      status === 'accepted' &&
      (await Match.count({
        where: { gigId: match.gigId, id: { [Op.ne]: match.id }, status: ['accepted', 'completed'] },
        transaction: t,
      }))
    ) {
      throw new HttpError('This gig has already been taken by another worker', 409);
    }

    const wasPending = match.status === 'pending';
    const now = new Date();
    const occurred = occurredTime(match, change, now);
    await match.update(
      {
        status,
        // respondedAt means specifically "the worker answered". A client cancelling
        // a pending match is a withdrawal, not a decline, and must not land in the
        // denominator of the acceptance rate.
        ...(wasPending && isWorker
          ? { respondedAt: now, respondedOccurredAt: occurred ?? now, wasQueuedOffline: Boolean(occurred) }
          : {}),
        ...(status === 'accepted' ? { acceptedAt: now } : {}),
        ...(status === 'cancelled' && declineReason ? { declineReason } : {}),
        // Who called off a job already under way: the completion rate counts it
        // against them, not against the other person.
        ...(status === 'cancelled' && !wasPending ? { cancelledVia: isWorker ? ('worker' as const) : ('client' as const) } : {}),
      },
      { transaction: t },
    );

    if (status === 'accepted' && gig) {
      await gig.update({ status: 'matched' }, { transaction: t });
      // Anyone named on the lead's crew is now asked to join.
      crewInvited = await teamService.createCrewInvites(match, t);

      // The gig is now taken: withdraw the other invitations and applications.
      // These carry no respondedAt, so they are excluded from acceptance-rate
      // measurement rather than counting as declines.
      const siblingMatches = await Match.findAll({
        where: { gigId: match.gigId, status: 'pending', id: { [Op.ne]: match.id } },
        transaction: t,
      });
      for (const other of siblingMatches) {
        await other.update({ status: 'cancelled' }, { transaction: t });
        notices.push({ userId: other.workerId, title: 'Gig already filled', body: `"${gig.title}" was taken by another worker.` });
      }
      const siblingApplications = await GigApplication.findAll({
        where: { gigId: match.gigId, status: 'pending' },
        transaction: t,
      });
      for (const other of siblingApplications) {
        await other.update({ status: 'rejected', rejectionReason: 'choseAnother' }, { transaction: t });
        notices.push({
          userId: other.workerId,
          title: 'Application not selected',
          body: `Your application for "${gig.title}" was not selected.`,
        });
      }
      notices.push({
        userId: gig.clientId,
        title: 'Worker confirmed',
        body: `The worker confirmed they will take "${gig.title}".`,
        category: 'outcome',
      });
    }

    if (status === 'cancelled' && gig?.status === 'matched') {
      // Siblings are still pending, so the gig goes back on the market intact.
      await gig.update({ status: 'open' }, { transaction: t });
      // The other person is told, never the one who acted.
      if (isWorker) {
        notices.push({
          userId: gig.clientId,
          title: wasPending ? 'Worker declined' : 'Match cancelled',
          body: `"${gig.title}" is open again${declineReason ? `: ${declineReason}` : '.'}`,
          // The client's gig just lost its worker and needs attention.
          category: 'outcome',
        });
      } else {
        notices.push({
          userId: match.workerId,
          title: wasPending ? 'Invitation withdrawn' : 'Job called off',
          body: wasPending
            ? `The client withdrew the invitation to "${gig.title}".`
            : `The client called off "${gig.title}". Nothing is owed${declineReason ? `: ${declineReason}` : '.'}`,
          category: 'outcome',
        });
      }
    }

    if (status === 'cancelled' && !wasPending) {
      // Called off after acceptance: nothing is owed. Money paid in advance under
      // the old escrow flow goes back to the client.
      await completionService.settleLegacyHold(match.id, 'refunded', 1, t);
      await completionService.settleLiveDispute(match.id, 'refund', t);
    }
  });

  // Committed: now tell people, and update anything derived from the change.
  await teamService.notifyCrewInvites(ctx, gigTitle, crewInvited);
  for (const notice of notices) await notify(ctx, notice);

  // Abandonment feeds the trust score's completion rate, so it has to be
  // recomputed here and not only when a review arrives.
  if (status === 'cancelled') {
    await trustScoreService.recalculate(found.workerId, { trigger: 'match:cancelled' });
    if (found.gig) await trustScoreService.recalculate(found.gig.clientId, { trigger: 'match:cancelled' });
  }
  return found.id;
};
