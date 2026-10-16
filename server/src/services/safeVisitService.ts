import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, Match, MatchMember, SafetyEvent, User } from '../models';
import * as sms from '../lib/channels/sms';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import { locationName } from '../lib/locationName';
import type { SafetyEventKind } from '../models/SafetyEvent';

/**
 * Safe visits: check in, check out and SOS for on-site jobs.
 *
 * The trusted contact is not an Isoko user, so they are reached by SMS
 * directly. An SMS failure never blocks the event itself: the record is what
 * matters, and admins see every SOS whether or not the text got through.
 *
 * Everyone on the job's site is covered: the lead worker and any crew member
 * who joined. A visit belongs to a person, so two people on one job each check
 * in and out for themselves.
 */

type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: (Gig & { client?: User | null }) | null };

/** A visit still open this long after check-in is flagged to admins. */
export const OVERDUE_AFTER_MS = 12 * 60 * 60 * 1000;
/** A second SOS this soon after an open one joins it instead of raising another alert. */
export const SOS_REPEAT_WINDOW_MS = 2 * 60 * 1000;

const loadMatch = async (matchId: string) => {
  const match = (await Match.findByPk(matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: User, as: 'client', attributes: ['id', 'name', 'phone'] }] }],
  })) as MatchWithGig | null;
  if (!match || !match.gig) throw new HttpError('Match not found', 404);
  return match;
};

/** The lead worker, or a crew member who joined: the people physically on the job. */
const onSite = async (match: Match, userId: string) =>
  match.workerId === userId ||
  Boolean(await MatchMember.count({ where: { matchId: match.id, userId, status: 'joined' } }));

/** This person's last arrival or departure on this job. */
const lastEvent = (matchId: string, userId: string) =>
  SafetyEvent.findOne({
    where: { matchId, userId, kind: { [Op.in]: ['check_in', 'check_out'] } },
    order: [['createdAt', 'DESC']],
  });

const checkedIn = async (matchId: string, userId: string) => (await lastEvent(matchId, userId))?.kind === 'check_in';

/**
 * Who may act on this job's visit. Arriving needs a job in progress; leaving
 * and SOS also work after the job is closed while the person is still checked
 * in, because a client marking the job done does not move the worker out of
 * the house.
 */
const authorise = async (matchId: string, userId: string, action: 'arrive' | 'leave' | 'sos') => {
  const match = await loadMatch(matchId);
  if (!(await onSite(match, userId))) throw new HttpError('Only the people working on this job can do this', 403);
  if (match.status !== 'accepted' && (action === 'arrive' || !(await checkedIn(matchId, userId)))) {
    throw new HttpError('Safe visits apply to a job in progress', 409);
  }
  return match;
};

const textContact = async (worker: User, text: string): Promise<boolean> => {
  if (!worker.trustedContactPhone) return false;
  try {
    await sms.send({ to: worker.trustedContactPhone, text: `Isoko: ${text}` });
    return true;
  } catch {
    return false;
  }
};

const coordsOf = (coords?: { lat?: unknown; lng?: unknown }) => {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : { lat: null, lng: null };
};

/** Saves the event, then texts the trusted contact and records whether it got through. */
const record = async (
  match: MatchWithGig,
  worker: User,
  kind: SafetyEventKind,
  text: string,
  coords?: { lat?: unknown; lng?: unknown },
) => {
  const event = await SafetyEvent.create({
    matchId: match.id,
    userId: worker.id,
    kind,
    ...coordsOf(coords),
    contactNotified: false,
    resolvedAt: null,
    resolvedBy: null,
  });
  if (await textContact(worker, text)) await event.update({ contactNotified: true });
  return event;
};

const tellAdmins = async (ctx: AppContext, title: string, body: string, category: 'critical' | 'outcome') => {
  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  await Promise.all(admins.map((admin) => notify(ctx, { userId: admin.id, title, body, category })));
};

export const checkIn = async (ctx: AppContext, matchId: string, userId: string, coords?: { lat?: unknown; lng?: unknown }) => {
  const match = await authorise(matchId, userId, 'arrive');
  if (await checkedIn(matchId, userId)) throw new HttpError('You are already checked in', 409);
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
  const match = await loadMatch(matchId);
  if (!(await onSite(match, userId))) throw new HttpError('Only the people working on this job can do this', 403);
  if (!(await checkedIn(matchId, userId))) throw new HttpError('Check in before checking out', 409);
  const worker = (await User.findByPk(userId)) as User;
  return record(match, worker, 'check_out', `${worker.name} left "${match.gig?.title}" safely.`, coords);
};

/**
 * An SOS: saved first, then every admin and the trusted contact are told at
 * once, so a slow SMS gateway never delays the alert. A second press within
 * two minutes of an open SOS joins it (and re-sends the text) rather than
 * raising a duplicate alert; a later one is a new alert.
 */
export const sos = async (ctx: AppContext, matchId: string, userId: string, coords?: { lat?: unknown; lng?: unknown }) => {
  const match = await authorise(matchId, userId, 'sos');
  const worker = (await User.findByPk(userId)) as User;
  const text = `URGENT: ${worker.name} asked for help during "${match.gig?.title}"${
    match.gig ? ` (${locationName(match.gig.locationLat, match.gig.locationLng) ?? 'Kigali'})` : ''
  }. Call them now${worker.phone ? ` on ${worker.phone}` : ''}.`;

  const recent = await SafetyEvent.findOne({
    where: {
      matchId,
      userId,
      kind: 'sos',
      resolvedAt: null,
      createdAt: { [Op.gte]: new Date(Date.now() - SOS_REPEAT_WINDOW_MS) },
    },
    order: [['createdAt', 'DESC']],
  });
  if (recent) {
    const where = coordsOf(coords);
    if (where.lat !== null && recent.lat === null) await recent.update(where);
    if (!recent.contactNotified && (await textContact(worker, text))) await recent.update({ contactNotified: true });
    return recent;
  }

  const event = await SafetyEvent.create({
    matchId,
    userId,
    kind: 'sos',
    ...coordsOf(coords),
    contactNotified: false,
    resolvedAt: null,
    resolvedBy: null,
  });
  const [texted] = await Promise.all([
    textContact(worker, text),
    tellAdmins(
      ctx,
      'SOS from a worker',
      `${worker.name} raised an SOS during "${match.gig?.title}". Open Safety alerts to call them.`,
      'critical',
    ),
  ]);
  if (texted) await event.update({ contactNotified: true });
  return event;
};

/** Where this person's visit stands, and their latest SOS, for the job card. */
export const statusFor = async (matchId: string, userId: string) => {
  const [last, latestSos] = await Promise.all([
    lastEvent(matchId, userId),
    SafetyEvent.findOne({ where: { matchId, userId, kind: 'sos' }, order: [['createdAt', 'DESC']] }),
  ]);
  return {
    checkedIn: last?.kind === 'check_in',
    since: last?.kind === 'check_in' ? last.createdAt : null,
    sos: latestSos
      ? {
          id: latestSos.id,
          at: latestSos.createdAt,
          contactNotified: latestSos.contactNotified,
          acknowledgedAt: latestSos.acknowledgedAt,
          resolvedAt: latestSos.resolvedAt,
        }
      : null,
  };
};

/** Flags visits checked into long ago and never left, once each. */
export const flagOverdue = async (ctx: AppContext, now = new Date()): Promise<number> => {
  const checkIns = await SafetyEvent.findAll({
    where: { kind: 'check_in', createdAt: { [Op.lte]: new Date(now.getTime() - OVERDUE_AFTER_MS) } },
    include: [
      { model: User, as: 'user', attributes: ['id', 'name'] },
      { model: Match, as: 'match', attributes: ['id'], include: [{ model: Gig, as: 'gig', attributes: ['title'] }] },
    ],
  });
  let flagged = 0;
  for (const ci of checkIns) {
    const later = await SafetyEvent.count({
      where: {
        matchId: ci.matchId,
        userId: ci.userId,
        createdAt: { [Op.gt]: ci.createdAt },
        kind: { [Op.in]: ['check_out', 'overdue'] },
      },
    });
    if (later) continue;
    await SafetyEvent.create({
      matchId: ci.matchId,
      userId: ci.userId,
      kind: 'overdue',
      lat: ci.lat,
      lng: ci.lng,
      contactNotified: false,
      resolvedAt: null,
      resolvedBy: null,
    });
    const title = (ci.match as (Match & { gig?: Gig }) | undefined)?.gig?.title ?? 'a job';
    await tellAdmins(
      ctx,
      'Visit not checked out',
      `${ci.user?.name ?? 'A worker'} checked in for "${title}" over 12 hours ago and has not checked out. Open Safety alerts to call them.`,
      'outcome',
    );
    flagged += 1;
  }
  return flagged;
};

const person = ['id', 'name', 'phone', 'trustedContactName', 'trustedContactPhone'];

/**
 * SOS and overdue alerts for the admin Safety page, open ones first, with
 * everything needed to act: the worker's and trusted contact's numbers, the
 * client's, where the job is, and who has already picked it up.
 */
export const alerts = async () => {
  const events = await SafetyEvent.findAll({
    where: { kind: { [Op.in]: ['sos', 'overdue'] } },
    include: [
      { model: User, as: 'user', attributes: person },
      { model: User, as: 'acknowledger', attributes: ['id', 'name'] },
      { model: User, as: 'resolver', attributes: ['id', 'name'] },
      {
        model: Match,
        as: 'match',
        attributes: ['id', 'gigId', 'status'],
        include: [
          {
            model: Gig,
            as: 'gig',
            attributes: ['id', 'title', 'locationLat', 'locationLng'],
            include: [{ model: User, as: 'client', attributes: ['id', 'name', 'phone'] }],
          },
        ],
      },
    ],
    order: [['resolvedAt', 'ASC NULLS FIRST'], ['createdAt', 'DESC']],
    limit: 100,
  });
  return Promise.all(
    events.map(async (e) => {
      const plain = e.get({ plain: true }) as Record<string, unknown> & {
        user?: Record<string, unknown>;
        acknowledger?: unknown;
        resolver?: unknown;
        match?: { gig?: { locationLat: number; locationLng: number } };
      };
      // Private fields are kept off ordinary serialisation; admins need them here.
      const worker = e.user as User | undefined;
      const client = (e.match as (Match & { gig?: Gig & { client?: User } }) | undefined)?.gig?.client;
      const visit = await lastEvent(e.matchId, e.userId);
      return {
        ...plain,
        user: worker
          ? {
              id: worker.id,
              name: worker.name,
              phone: worker.phone,
              trustedContactName: worker.trustedContactName,
              trustedContactPhone: worker.trustedContactPhone,
            }
          : null,
        client: client ? { id: client.id, name: client.name, phone: client.phone } : null,
        area: plain.match?.gig ? locationName(plain.match.gig.locationLat, plain.match.gig.locationLng) : null,
        checkedInSince: visit?.kind === 'check_in' ? visit.createdAt : null,
        acknowledger: plain.acknowledger ?? null,
        resolver: plain.resolver ?? null,
      };
    }),
  );
};

/** How many alerts are still open, for the admin sidebar. */
export const openCount = () => SafetyEvent.count({ where: { kind: { [Op.in]: ['sos', 'overdue'] }, resolvedAt: null } });

const findAlert = async (eventId: string) => {
  const event = await SafetyEvent.findByPk(eventId);
  if (!event || (event.kind !== 'sos' && event.kind !== 'overdue')) throw new HttpError('Alert not found', 404);
  return event;
};

/** An admin says they are on it. The worker is told someone at Isoko has seen their alert. */
export const acknowledge = async (ctx: AppContext, eventId: string, adminId: string) => {
  const event = await findAlert(eventId);
  if (event.acknowledgedAt || event.resolvedAt) return event;
  await event.update({ acknowledgedAt: new Date(), acknowledgedBy: adminId });
  await notify(ctx, {
    userId: event.userId,
    title: event.kind === 'sos' ? 'Isoko has seen your SOS' : 'Isoko is checking on you',
    body:
      event.kind === 'sos'
        ? 'Someone from the Isoko team is following up now. If you are in danger, call 112.'
        : 'You have been checked in for a long time. Someone from the Isoko team will call you.',
    category: 'critical',
  });
  return event;
};

/** An admin closes an alert, saying what was done. */
export const resolve = async (ctx: AppContext, eventId: string, adminId: string, note?: unknown) => {
  const event = await findAlert(eventId);
  if (event.resolvedAt) return event;
  const text = typeof note === 'string' ? note.trim().slice(0, 1000) : '';
  if (text.length < 3) throw new HttpError('Say briefly what was done, for the record', 400);
  const now = new Date();
  await event.update({
    resolvedAt: now,
    resolvedBy: adminId,
    resolutionNote: text,
    ...(event.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedBy: adminId }),
  });
  await notify(ctx, {
    userId: event.userId,
    title: 'Safety alert closed',
    body: `The Isoko team closed your ${event.kind === 'sos' ? 'SOS' : 'visit alert'}: ${text}`,
    category: 'outcome',
  });
  return event;
};
