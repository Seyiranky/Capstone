import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, Match, SafetyEvent, User } from '../models';
import * as sms from '../lib/channels/sms';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import type { SafetyEventKind } from '../models/SafetyEvent';

/**
 * Safe visits: check in, check out and SOS for on-site jobs.
 *
 * The trusted contact is not an Isoko user, so they are reached by SMS
 * directly. An SMS failure never blocks the event itself: the record is what
 * matters, and admins see every SOS whether or not the text got through.
 */

type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: (Gig & { client?: User | null }) | null };

/** A visit still open this long after check-in is flagged to admins. */
export const OVERDUE_AFTER_MS = 12 * 60 * 60 * 1000;

const loadForWorker = async (matchId: string, userId: string) => {
  const match = (await Match.findByPk(matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] }],
  })) as MatchWithGig | null;
  if (!match || !match.gig) throw new HttpError('Match not found', 404);
  if (match.workerId !== userId) throw new HttpError('Only the worker on this job can do this', 403);
  if (match.status !== 'accepted') throw new HttpError('Safe visits apply to a job in progress', 409);
  return match;
};

const lastEvent = (matchId: string) =>
  SafetyEvent.findOne({
    where: { matchId, kind: { [Op.in]: ['check_in', 'check_out'] } },
    order: [['createdAt', 'DESC']],
  });

const textContact = async (worker: User, text: string): Promise<boolean> => {
  if (!worker.trustedContactPhone) return false;
  try {
    await sms.send({ to: worker.trustedContactPhone, text: `Isoko: ${text}` });
    return true;
  } catch {
    return false;
  }
};

const record = async (
  match: MatchWithGig,
  worker: User,
  kind: SafetyEventKind,
  text: string,
  coords?: { lat?: unknown; lng?: unknown },
) => {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  const contactNotified = await textContact(worker, text);
  return SafetyEvent.create({
    matchId: match.id,
    userId: worker.id,
    kind,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    contactNotified,
    resolvedAt: null,
    resolvedBy: null,
  });
};

export const checkIn = async (ctx: AppContext, matchId: string, userId: string, coords?: { lat?: unknown; lng?: unknown }) => {
  const match = await loadForWorker(matchId, userId);
  const last = await lastEvent(matchId);
  if (last?.kind === 'check_in') throw new HttpError('You are already checked in', 409);
  const worker = (await User.findByPk(userId)) as User;
  const event = await record(
    match,
    worker,
    'check_in',
    `${worker.name} arrived for "${match.gig?.title}" with ${match.gig?.client?.name ?? 'a client'}. You will get a text when they leave.`,
    coords,
  );
  if (match.gig) {
    await notify(ctx, {
      userId: match.gig.clientId,
      title: 'Worker arrived',
      body: `${worker.name} checked in for "${match.gig.title}".`,
      category: 'activity',
    });
  }
  return event;
};

export const checkOut = async (_ctx: AppContext, matchId: string, userId: string, coords?: { lat?: unknown; lng?: unknown }) => {
  const match = await loadForWorker(matchId, userId);
  const last = await lastEvent(matchId);
  if (last?.kind !== 'check_in') throw new HttpError('Check in before checking out', 409);
  const worker = (await User.findByPk(userId)) as User;
  return record(match, worker, 'check_out', `${worker.name} left "${match.gig?.title}" safely.`, coords);
};

/** An SOS reaches the trusted contact and every admin at once, marked critical. */
export const sos = async (ctx: AppContext, matchId: string, userId: string, coords?: { lat?: unknown; lng?: unknown }) => {
  const match = await loadForWorker(matchId, userId);
  const worker = (await User.findByPk(userId)) as User;
  const event = await record(
    match,
    worker,
    'sos',
    `URGENT: ${worker.name} asked for help during "${match.gig?.title}". Call them now.`,
    coords,
  );
  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  for (const admin of admins) {
    await notify(ctx, {
      userId: admin.id,
      title: 'SOS from a worker',
      body: `${worker.name} raised an SOS during "${match.gig?.title}".${event.contactNotified ? ' Their trusted contact was texted.' : ' No trusted contact could be texted.'}`,
      category: 'critical',
    });
  }
  return event;
};

/** Where a job's visit stands, for its card. */
export const statusFor = async (matchId: string) => {
  const last = await lastEvent(matchId);
  return { checkedIn: last?.kind === 'check_in', since: last?.createdAt ?? null };
};

/** Flags visits checked into long ago and never left, once each. */
export const flagOverdue = async (ctx: AppContext, now = new Date()): Promise<number> => {
  const checkIns = await SafetyEvent.findAll({
    where: { kind: 'check_in', createdAt: { [Op.lte]: new Date(now.getTime() - OVERDUE_AFTER_MS) } },
  });
  let flagged = 0;
  for (const ci of checkIns) {
    const later = await SafetyEvent.count({
      where: { matchId: ci.matchId, createdAt: { [Op.gt]: ci.createdAt }, kind: { [Op.in]: ['check_out', 'overdue'] } },
    });
    if (later) continue;
    await SafetyEvent.create({
      matchId: ci.matchId,
      userId: ci.userId,
      kind: 'overdue',
      lat: null,
      lng: null,
      contactNotified: false,
      resolvedAt: null,
      resolvedBy: null,
    });
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    for (const admin of admins) {
      await notify(ctx, { userId: admin.id, title: 'Visit not checked out', body: 'A worker has been checked in for over 12 hours.', category: 'outcome' });
    }
    flagged += 1;
  }
  return flagged;
};

/** SOS and overdue alerts for the admin Safety page, open ones first. */
export const alerts = async () =>
  SafetyEvent.findAll({
    where: { kind: { [Op.in]: ['sos', 'overdue'] } },
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'trustedContactName'] },
      { model: Match, as: 'match', attributes: ['id', 'gigId'], include: [{ model: Gig, as: 'gig', attributes: ['id', 'title'] }] },
    ],
    order: [['resolvedAt', 'ASC NULLS FIRST'], ['createdAt', 'DESC']],
    limit: 100,
  });

export const resolve = async (eventId: string, adminId: string) => {
  const event = await SafetyEvent.findByPk(eventId);
  if (!event || (event.kind !== 'sos' && event.kind !== 'overdue')) throw new HttpError('Alert not found', 404);
  if (!event.resolvedAt) await event.update({ resolvedAt: new Date(), resolvedBy: adminId });
  return event;
};
