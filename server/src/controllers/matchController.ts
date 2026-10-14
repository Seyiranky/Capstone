import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import type { Includeable } from 'sequelize';
import fs from 'fs';
import crypto from 'crypto';
import { Match, MatchMember, Gig, User, Transaction, Review, GigApplication, JobPhoto } from '../models';
import * as teamService from '../services/teamService';
import * as safeVisitService from '../services/safeVisitService';
import { MAX_JOB_PHOTOS } from '../middleware/upload';
import * as trustScoreService from '../services/trustScoreService';
import * as completionService from '../services/completionService';
import notify from '../lib/notify';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';
import type { MatchStatus } from '../types/domain';

const MATCH_INCLUDES: Includeable[] = [
  { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
  { model: User, as: 'worker' },
  { model: Transaction, as: 'transaction' },
  { model: Review, as: 'reviews' },
  { model: JobPhoto, as: 'photos', attributes: ['id', 'url', 'sha256', 'createdAt'] },
  {
    model: MatchMember,
    as: 'members',
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'trustScore', 'reviewCount'] }],
  },
];

export const listMatches = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  let matches: Match[];
  if (caller.role === 'worker') {
    // Jobs they lead, and jobs they are on as crew or apprentice.
    const memberOf = (
      await MatchMember.findAll({ where: { userId: caller.id }, attributes: ['matchId'] })
    ).map((m) => m.matchId);
    matches = await Match.findAll({
      where: { [Op.or]: [{ workerId: caller.id }, { id: memberOf }] },
      include: MATCH_INCLUDES,
    });
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

  // A gig is done once. A stray invitation must not be accepted on a gig that
  // someone else has already taken, or the client would pay for it twice.
  if (
    status === 'accepted' &&
    (await Match.count({ where: { gigId: match.gigId, id: { [Op.ne]: match.id }, status: ['accepted', 'completed'] } }))
  ) {
    res.status(409).json({ message: 'This gig has already been taken by another worker' });
    return;
  }

  // Marking the job done is the client's word that the work was delivered, and
  // it is what asks them to pay, so only the client may do it.
  if (status === 'completed' && !isClient) {
    res.status(403).json({ message: 'Only the client may mark this job as done' });
    return;
  }

  if (status === 'completed') {
    // The client marks the job done; they then pay the worker with Mobile Money.
    await completionService.completeMatch(req, Object.assign(match, { gig }), 'client');
    res.json(await Match.findByPk(match.id, { include: MATCH_INCLUDES }));
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
    // Anyone named on the lead's crew is now asked to join.
    await teamService.inviteCrew(req, Object.assign(match, { gig }));

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
        await other.update({ status: 'rejected', rejectionReason: 'choseAnother' });
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

  if (status === 'cancelled' && !wasPending) {
    // Called off after acceptance: nothing is owed. Money paid in advance under
    // the old escrow flow goes back to the client.
    await completionService.settleLegacyHold(match.id, 'refunded');
    await completionService.settleLiveDispute(match.id, 'refund');
  }

  // Abandonment feeds the trust score's completion rate, so it has to be
  // recomputed here and not only when a review arrives.
  if (status === 'cancelled') {
    await trustScoreService.recalculate(match.workerId, { trigger: 'match:cancelled' });
    if (gig) {
      await trustScoreService.recalculate(gig.clientId, { trigger: 'match:cancelled' });
    }
  }

  const updated = await Match.findByPk(match.id, { include: MATCH_INCLUDES });
  res.json(updated);
};

/**
 * The worker attaches photos of the finished work, while the job is in progress
 * or after it is done. They become the job's entry in the worker's work history,
 * and, during a dispute, something the mediators can look at.
 */
export const addJobPhotos = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const discard = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => undefined));

  const match = await Match.findByPk(pathParam(req, 'id'));
  if (!match) {
    discard();
    res.status(404).json({ message: 'Match not found' });
    return;
  }
  if (match.workerId !== caller.id) {
    discard();
    res.status(403).json({ message: 'Only the worker on this job may add photos' });
    return;
  }
  if (match.status !== 'accepted' && match.status !== 'completed') {
    discard();
    res.status(409).json({ message: 'Photos can only be added to a job in progress or done' });
    return;
  }
  if (files.length === 0) {
    res.status(400).json({ message: 'Attach at least one photo' });
    return;
  }
  const existing = await JobPhoto.count({ where: { matchId: match.id } });
  if (existing + files.length > MAX_JOB_PHOTOS) {
    discard();
    res.status(409).json({ message: `A job can have at most ${MAX_JOB_PHOTOS} photos` });
    return;
  }

  await JobPhoto.bulkCreate(
    files.map((file) => ({
      matchId: match.id,
      url: `/uploads/jobs/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex'),
    })),
  );
  res.status(201).json(await Match.findByPk(match.id, { include: MATCH_INCLUDES }));
};

const visitHandler =
  (action: typeof safeVisitService.checkIn) =>
  async (req: Request, res: Response): Promise<void> => {
    const caller = authed(req);
    res.status(201).json(await action(req, pathParam(req, 'id'), caller.id, { lat: req.body?.lat, lng: req.body?.lng }));
  };

/** Safe visit: arrive, leave, or ask for help on an on-site job. */
export const checkIn = visitHandler(safeVisitService.checkIn);
export const checkOut = visitHandler(safeVisitService.checkOut);
export const sos = visitHandler(safeVisitService.sos);

export const visitStatus = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.statusFor(pathParam(req, 'id')));
};
