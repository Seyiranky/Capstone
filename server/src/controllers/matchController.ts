import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import type { Includeable } from 'sequelize';
import { Match, Gig, User, Transaction, Review, GigApplication } from '../models';
import * as paymentService from '../services/paymentService';
import * as trustScoreService from '../services/trustScoreService';
import * as competenceService from '../services/competenceService';
import notify from '../lib/notify';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';
import type { MatchStatus } from '../types/domain';

const MATCH_INCLUDES: Includeable[] = [
  { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
  { model: User, as: 'worker' },
  { model: Transaction, as: 'transaction' },
  { model: Review, as: 'reviews' },
];

export const listMatches = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  let matches: Match[];
  if (caller.role === 'worker') {
    matches = await Match.findAll({ where: { workerId: caller.id }, include: MATCH_INCLUDES });
  } else if (caller.role === 'admin') {
    matches = await Match.findAll({ include: MATCH_INCLUDES });
  } else {
    matches = await Match.findAll({
      include: [
        { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }], where: { clientId: caller.id } },
        ...MATCH_INCLUDES.slice(1),
      ],
    });
  }
  res.json(matches);
};

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
 * and is not yet narrowed, which is what the original `?.` allowed for.
 */
const canTransition = (from: string, to: unknown): to is MatchStatus =>
  ALLOWED_TRANSITIONS[from as MatchStatus]?.includes(to as MatchStatus) ?? false;

export const updateMatchStatus = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { status, declineReason, occurredAt, queuedOffline } = req.body ?? {};
  const match = (await Match.findByPk(pathParam(req, 'id'), {
    include: [{ model: Gig, as: 'gig' }],
  })) as (Match & { gig?: Gig | null }) | null;
  if (!match) {
    res.status(404).json({ message: 'Match not found' });
    return;
  }

  const gig = match.gig;
  const isWorker = match.workerId === caller.id;
  const isClient = gig?.clientId === caller.id;
  if (!isWorker && !isClient) {
    res
      .status(403)
      .json({ message: 'Only the matched worker or the posting client may update this match' });
    return;
  }

  if (!canTransition(match.status, status)) {
    res.status(409).json({
      message: `Cannot transition match from '${match.status}' to '${status}'`,
    });
    return;
  }

  // Acceptance is the worker's own signal; a client accepting on their behalf
  // would make the acceptance rate meaningless as a measure.
  if (status === 'accepted' && !isWorker) {
    res.status(403).json({ message: 'Only the matched worker may accept this match' });
    return;
  }

  const wasPending = match.status === 'pending';
  const now = new Date();
  // When the worker acted, if the client recorded it. Only trusted for actions
  // that were genuinely queued offline, and never allowed to be in the future
  // or older than the match itself — a client clock is not an authority.
  const claimed = occurredAt ? new Date(occurredAt) : null;
  const occurred =
    queuedOffline &&
    claimed &&
    !Number.isNaN(claimed.getTime()) &&
    claimed <= now &&
    claimed >= match.createdAt
      ? claimed
      : null;
  await match.update({
    status,
    // respondedAt means specifically "the worker answered". A client cancelling
    // a pending match is a withdrawal, not a decline, and must not land in the
    // denominator of the acceptance rate.
    ...(wasPending && isWorker
      ? {
          respondedAt: now,
          respondedOccurredAt: occurred ?? now,
          wasQueuedOffline: Boolean(occurred),
        }
      : {}),
    ...(status === 'accepted' ? { acceptedAt: now } : {}),
    ...(status === 'cancelled' && declineReason ? { declineReason } : {}),
  });

  if (status === 'accepted' && gig) {
    await gig.update({ status: 'matched' });

    // The gig is now taken: withdraw the other invitations and applications.
    // These carry no respondedAt, so they are excluded from acceptance-rate
    // measurement rather than counting as declines.
    const [siblingMatches, siblingApplications] = await Promise.all([
      Match.findAll({
        where: { gigId: match.gigId, status: 'pending', id: { [Op.ne]: match.id } },
      }),
      GigApplication.findAll({ where: { gigId: match.gigId, status: 'pending' } }),
    ]);

    await Promise.all([
      ...siblingMatches.map(async (other) => {
        await other.update({ status: 'cancelled' });
        await notify(req, {
          userId: other.workerId,
          title: 'Gig already filled',
          body: `"${gig.title}" was taken by another worker.`,
        });
      }),
      ...siblingApplications.map(async (other) => {
        await other.update({ status: 'rejected' });
        await notify(req, {
          userId: other.workerId,
          title: 'Application not selected',
          body: `Your application for "${gig.title}" was not selected.`,
        });
      }),
    ]);

    await notify(req, {
      userId: gig.clientId,
      title: 'Worker confirmed',
      body: `The worker confirmed they will take "${gig.title}".`,
      category: 'outcome',
    });
  }

  if (status === 'completed' && gig) {
    await paymentService.initiate(match, gig.budget);
    await gig.update({ status: 'completed' });
  }
  if (status === 'cancelled' && gig?.status === 'matched') {
    // Siblings are still pending, so the gig goes back on the market intact.
    await gig.update({ status: 'open' });
    await notify(req, {
      userId: gig.clientId,
      title: wasPending ? 'Worker declined' : 'Match cancelled',
      body: `"${gig.title}" is open again${declineReason ? `: ${declineReason}` : '.'}`,
      // The client's gig just lost its worker and needs attention.
      category: 'outcome',
    });
  }

  // Completion and abandonment both feed the trust score's completion rate, so
  // it has to be recomputed here and not only when a review arrives.
  if (status === 'completed' || status === 'cancelled') {
    await trustScoreService.recalculate(match.workerId, { trigger: `match:${status}` });
    if (gig) {
      await trustScoreService.recalculate(gig.clientId, { trigger: `match:${status}` });
    }
  }
  if (status === 'completed') {
    // Completed, reviewed work is itself a credential once there is enough of
    // it, so finishing a job can raise provenance for that skill.
    await competenceService.recalculateAllFor(match.workerId, { trigger: 'match:completed' });
  }

  const updated = await Match.findByPk(match.id, { include: MATCH_INCLUDES });
  res.json(updated);
};
