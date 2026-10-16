import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Request } from 'express';
import { Dispute, DisputeVote, Gig, Match, Transaction, User, sequelize } from '../models';
import * as completionService from './completionService';
import * as collusionDetectionService from './collusionDetectionService';
import {
  PEER_MIN_REVIEWS,
  PEER_MIN_TRUST_SCORE,
  pastCollaborators,
} from './skillVerificationService';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import type { DisputeOutcome, DisputeReason, DisputeStage } from '../types/domain';
import * as supportService from './supportService';

/**
 * Disputes about a job in progress, decided by three screened peers.
 *
 * Marketplaces send disputes to a support desk. Here the same rules that keep
 * skill reviews honest pick the panel: mediators must be well rated with a
 * track record, must never have worked with either party, and must not be
 * flagged by the collusion audit. The draw is seeded and the seed kept, so it
 * can be replayed. Admins step in only when no majority forms in time, when
 * too few eligible mediators exist, or to override, and every override is kept.
 */

type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: Gig | null };

export const PANEL_SIZE = 3;
export const MAJORITY = 2;
export const DECIDE_WITHIN_MS = 5 * 24 * 60 * 60 * 1000;
export const DISPUTE_REASONS: DisputeReason[] = ['notDone', 'poorQuality', 'noShow', 'notReleased', 'notPaid', 'other'];
/** How long after a paid job is done it can still be disputed. */
export const PAID_DISPUTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const OUTCOMES: DisputeOutcome[] = ['release', 'refund', 'split'];
const DETAILS_MAX = 2000;

const loadMatch = async (matchId: string): Promise<MatchWithGig | null> =>
  (await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] })) as MatchWithGig | null;

export interface Eligibility {
  canOpen: boolean;
  stage: DisputeStage | null;
  reasons: DisputeReason[];
  /** Why not, when it cannot be opened: a key the client words. */
  blocked?: 'not_party' | 'not_started' | 'cancelled' | 'already_disputed' | 'window_passed';
}

/**
 * Whether a person can open a dispute on a job, at which stage, and for which reasons.
 *
 * Under Mobile Money the client pays after marking the job done, so a job can
 * be disputed while it is under way, while it waits to be paid, and for two
 * weeks after it is paid. One dispute per job: whatever it decides is final.
 */
export const eligibility = async (match: MatchWithGig, userId: string): Promise<Eligibility> => {
  const isWorker = match.workerId === userId;
  const isClient = match.gig?.clientId === userId;
  const no = (blocked: Eligibility['blocked']): Eligibility => ({ canOpen: false, stage: null, reasons: [], blocked });
  if (!isWorker && !isClient) return no('not_party');
  if (match.status === 'pending') return no('not_started');
  if (match.status === 'cancelled') return no('cancelled');
  if (await Dispute.count({ where: { matchId: match.id } })) return no('already_disputed');

  if (match.status === 'accepted') {
    return {
      canOpen: true,
      stage: 'in_progress',
      reasons: isWorker ? ['noShow', 'notReleased', 'other'] : ['notDone', 'poorQuality', 'noShow', 'other'],
    };
  }
  const paid = await Transaction.count({ where: { matchId: match.id, status: 'confirmed' } });
  if (!paid) {
    return {
      canOpen: true,
      stage: 'awaiting_payment',
      reasons: isWorker ? ['notPaid', 'other'] : ['notDone', 'poorQuality', 'other'],
    };
  }
  const doneAt = match.completedAt ?? match.updatedAt;
  if (Date.now() - new Date(doneAt).getTime() > PAID_DISPUTE_WINDOW_MS) return no('window_passed');
  return {
    canOpen: true,
    stage: 'paid',
    reasons: isWorker ? ['other'] : ['notDone', 'poorQuality', 'other'],
  };
};

/** Every job of the caller's, with whether and how it can be disputed, for the screens. */
export const eligibleFor = async (userId: string) => {
  const matches = (await Match.findAll({
    where: { [Op.or]: [{ workerId: userId }, { '$gig.clientId$': userId }], status: ['accepted', 'completed'] },
    include: [
      { model: Gig, as: 'gig', include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
      { model: User, as: 'worker', attributes: ['id', 'name'] },
    ],
    order: [['updatedAt', 'DESC']],
  })) as (MatchWithGig & { gig: Gig & { client?: User }; worker?: User })[];
  const out = [];
  for (const m of matches) {
    const e = await eligibility(m, userId);
    out.push({
      matchId: m.id,
      gigTitle: m.gig?.title ?? '',
      otherParty: m.workerId === userId ? m.gig?.client?.name ?? '' : m.worker?.name ?? '',
      asWorker: m.workerId === userId,
      price: Math.round(Number(m.agreedAmount ?? m.gig?.budget ?? 0)),
      ...e,
    });
  }
  return out;
};

/** The deterministic order a seed puts candidates in, so a panel can be redrawn by an auditor. */
const seededOrder = (ids: string[], seed: string): string[] =>
  [...ids].sort((a, b) => {
    const ha = crypto.createHash('sha256').update(`${seed}:${a}`).digest('hex');
    const hb = crypto.createHash('sha256').update(`${seed}:${b}`).digest('hex');
    return ha.localeCompare(hb);
  });

/**
 * Everyone who may sit on this dispute's panel.
 *
 * Exported so the eligibility rules are testable on their own, and so an
 * auditor can see the pool a panel was drawn from.
 */
export const eligibleMediators = async (workerId: string, clientId: string): Promise<string[]> => {
  const [candidates, workerTies, clientTies, audit] = await Promise.all([
    User.findAll({
      where: {
        role: { [Op.in]: ['worker', 'client'] },
        status: 'active',
        trustScore: { [Op.gte]: PEER_MIN_TRUST_SCORE },
        reviewCount: { [Op.gte]: PEER_MIN_REVIEWS },
        id: { [Op.notIn]: [workerId, clientId] },
      },
      attributes: ['id'],
    }),
    pastCollaborators(workerId),
    pastCollaborators(clientId),
    collusionDetectionService.report(),
  ]);
  // Any high- or medium-severity flag disqualifies: a flag is not a finding,
  // but a panel deciding money should not include anyone under question.
  const flagged = new Set(
    audit.flags.filter((f) => f.severity !== 'low').map((f) => f.reviewerId),
  );
  return candidates
    .map((u) => u.id)
    .filter((id) => !workerTies.has(id) && !clientTies.has(id) && !flagged.has(id));
};

/** Opens a dispute on a job in progress, and seats its panel. */
export const open = async (
  ctx: AppContext,
  { matchId, userId, reason, details }: { matchId: string; userId: string; reason: string; details: string },
): Promise<Dispute> => {
  const match = await loadMatch(matchId);
  if (!match || !match.gig) throw new HttpError('Match not found', 404);
  const isParty = match.workerId === userId || match.gig.clientId === userId;
  if (!isParty) throw new HttpError('Only the worker or the client on this job may open a dispute', 403);
  if (await completionService.hasLiveDispute(matchId)) {
    throw new HttpError('A dispute is already open on this job', 409);
  }
  const allowed = await eligibility(match, userId);
  if (!allowed.canOpen || !allowed.stage) {
    throw new HttpError(
      allowed.blocked === 'already_disputed'
        ? 'This job has already been through a dispute'
        : allowed.blocked === 'window_passed'
          ? 'A paid job can be disputed for 14 days after it is done'
          : 'This job cannot be disputed',
      409,
    );
  }
  if (!allowed.reasons.includes(reason as DisputeReason)) throw new HttpError('Choose one of the reasons offered for this job', 400);
  const text = String(details ?? '').trim();
  if (text.length < 10) throw new HttpError('Explain what happened in a sentence or two', 400);

  const pool = await eligibleMediators(match.workerId, match.gig.clientId);
  const seed = crypto.randomUUID();
  const panel = seededOrder(pool, seed).slice(0, PANEL_SIZE);
  const tooFew = panel.length < PANEL_SIZE;

  const dispute = await sequelize.transaction(async (t) => {
    const created = await Dispute.create(
      {
        matchId,
        openedById: userId,
        reason: reason as DisputeReason,
        details: text.slice(0, DETAILS_MAX),
        response: null,
        respondedAt: null,
        // Without a full panel there is no one to decide but an admin.
        status: tooFew ? 'escalated' : 'open',
        outcome: null,
        decidedBy: null,
        decidedAt: null,
        adminId: null,
        adminNote: null,
        deadlineAt: new Date(Date.now() + DECIDE_WITHIN_MS),
        panelSeed: tooFew ? null : seed,
        panelPoolSize: pool.length,
        stage: allowed.stage ?? undefined,
      },
      { transaction: t },
    );
    if (!tooFew) {
      await DisputeVote.bulkCreate(
        panel.map((mediatorId) => ({ disputeId: created.id, mediatorId, vote: null, rationale: null, votedAt: null, withMajority: null })),
        { transaction: t },
      );
    }
    return created;
  });

  const other = match.workerId === userId ? match.gig.clientId : match.workerId;
  await notify(ctx, {
    userId: other,
    title: 'Dispute opened',
    body:
      allowed.stage === 'awaiting_payment'
        ? `A dispute was opened on "${match.gig.title}". Payment waits until it is decided. Add your side so the mediators hear both.`
        : `A dispute was opened on "${match.gig.title}". Add your side so the mediators hear both.`,
    category: 'critical',
  });
  if (tooFew) {
    await notifyAdmins(ctx, 'Dispute needs an admin', `Too few eligible mediators for "${match.gig.title}".`);
  } else {
    for (const mediatorId of panel) {
      await notify(ctx, {
        userId: mediatorId,
        title: 'You were asked to mediate',
        body: `Help decide a dispute over "${match.gig.title}". You have 5 days.`,
        category: 'outcome',
      });
    }
  }
  return dispute;
};

const notifyAdmins = async (ctx: AppContext, title: string, body: string) => {
  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  for (const admin of admins) await notify(ctx, { userId: admin.id, title, body, category: 'outcome' });
};

/** The other party's side of the story, once. */
export const respond = async (disputeId: string, userId: string, response: string): Promise<Dispute> => {
  const dispute = await Dispute.findByPk(disputeId);
  if (!dispute) throw new HttpError('Dispute not found', 404);
  const match = await loadMatch(dispute.matchId);
  const isParty = match && (match.workerId === userId || match.gig?.clientId === userId);
  if (!isParty || dispute.openedById === userId) {
    throw new HttpError('Only the other party may respond', 403);
  }
  if (!['open', 'escalated'].includes(dispute.status)) throw new HttpError('This dispute is closed', 409);
  if (dispute.response) throw new HttpError('You have already responded', 409);
  const text = String(response ?? '').trim();
  if (text.length < 10) throw new HttpError('Explain your side in a sentence or two', 400);
  await dispute.update({ response: text.slice(0, DETAILS_MAX), respondedAt: new Date() });
  return dispute;
};

/**
 * Applies an outcome to the job and closes the dispute.
 *
 * Release completes the job at the full price; split completes it at half the
 * price; refund calls it off and nothing is owed. The client then pays what is
 * due with Mobile Money. Runs once: a dispute already closed is left alone.
 */
const decide = async (
  ctx: AppContext,
  dispute: Dispute,
  outcome: DisputeOutcome,
  by: { decidedBy: 'mediators' | 'admin'; adminId?: string; adminNote?: string },
): Promise<void> => {
  const [changed] = await Dispute.update(
    {
      status: 'decided',
      outcome,
      decidedBy: by.decidedBy,
      decidedAt: new Date(),
      adminId: by.adminId ?? null,
      adminNote: by.adminNote ?? null,
    },
    { where: { id: dispute.id, status: ['open', 'escalated'] } },
  );
  if (changed === 0) return;

  const votes = await DisputeVote.findAll({ where: { disputeId: dispute.id } });
  for (const v of votes) {
    await v.update({ withMajority: v.vote ? v.vote === outcome : null });
  }

  const match = await loadMatch(dispute.matchId);
  if (!match || !match.gig) return;
  const price = Math.round(Number(match.agreedAmount ?? match.gig.budget));
  const half = Math.round(price * 0.5);
  let summary: string;

  if (dispute.stage === 'awaiting_payment') {
    // The job is done and unpaid: the decision sets what the client owes.
    if (outcome === 'refund') {
      await match.update({ status: 'cancelled' });
      await match.gig.update({ status: 'cancelled' });
      // A payment request left waiting for approval is withdrawn.
      await Transaction.update(
        { status: 'failed', failureReason: 'Withdrawn: a dispute decided nothing is owed' },
        { where: { matchId: match.id, status: 'initiated' } },
      );
      summary = 'the job is called off and nothing is owed';
    } else if (outcome === 'split') {
      await match.update({ agreedAmount: half });
      summary = `the client pays half the price, ${half.toLocaleString('en-US')} RWF, with Mobile Money`;
    } else {
      summary = `the client pays the full price, ${price.toLocaleString('en-US')} RWF, with Mobile Money`;
    }
  } else if (dispute.stage === 'paid') {
    // The money has already reached the worker; Mobile Money cannot be pulled
    // back, so a decision against the worker becomes an amount owed, arranged
    // by the team through a support request.
    if (outcome === 'release') {
      summary = 'the payment stands and nothing changes';
    } else {
      const owed = outcome === 'refund' ? price : half;
      const ticket = await supportService.openOnBehalf(ctx, {
        userId: match.gig.clientId,
        category: 'payment',
        subject: `Refund after dispute: ${match.gig.title}`,
        systemKey: 'dispute_refund',
        meta: { amount: owed.toLocaleString('en-US'), title: match.gig.title },
        relatedType: 'match',
        relatedId: match.id,
        priority: 'high',
      });
      await dispute.update({ refundDue: owed, supportTicketId: ticket.id });
      summary = `the worker returns ${owed.toLocaleString('en-US')} RWF to the client; the Isoko team will contact you both to arrange it`;
    }
  } else if (outcome === 'refund') {
    await match.update({ status: 'cancelled' });
    await completionService.settleLegacyHold(match.id, 'refunded');
    await match.gig.update({ status: 'cancelled' });
    summary = 'the job is called off and nothing is owed';
  } else {
    await completionService.completeMatch(ctx, match, 'dispute', { share: outcome === 'split' ? 0.5 : 1 });
    summary =
      outcome === 'release'
        ? 'the job counts as done and the client pays the full price with Mobile Money'
        : 'the job counts as done and the client pays half the price with Mobile Money';
  }

  const decider = by.decidedBy === 'admin' ? 'An admin' : 'The mediators';
  for (const userId of [match.workerId, match.gig.clientId]) {
    await notify(ctx, {
      userId,
      title: 'Dispute decided',
      body: `${decider} decided the dispute over "${match.gig.title}": ${summary}.`,
      category: 'critical',
    });
  }
};

/** Records a mediator's vote and decides the dispute once a majority agrees. */
export const vote = async (
  ctx: AppContext,
  { disputeId, mediatorId, outcome, rationale }: { disputeId: string; mediatorId: string; outcome: string; rationale?: string },
): Promise<Dispute> => {
  if (!OUTCOMES.includes(outcome as DisputeOutcome)) throw new HttpError('Unknown outcome', 400);
  const dispute = await Dispute.findByPk(disputeId);
  if (!dispute) throw new HttpError('Dispute not found', 404);
  if (dispute.status !== 'open') throw new HttpError('This dispute is no longer taking votes', 409);
  const seat = await DisputeVote.findOne({ where: { disputeId, mediatorId } });
  if (!seat) throw new HttpError('You are not on this panel', 403);
  if (seat.vote) throw new HttpError('You have already voted', 409);

  await seat.update({
    vote: outcome as DisputeOutcome,
    rationale: rationale ? String(rationale).trim().slice(0, DETAILS_MAX) : null,
    votedAt: new Date(),
  });

  const votes = await DisputeVote.findAll({ where: { disputeId } });
  const tally = new Map<DisputeOutcome, number>();
  for (const v of votes) if (v.vote) tally.set(v.vote, (tally.get(v.vote) ?? 0) + 1);
  const winner = [...tally.entries()].find(([, n]) => n >= MAJORITY)?.[0];

  if (winner) {
    await decide(ctx, dispute, winner, { decidedBy: 'mediators' });
  } else if (votes.every((v) => v.vote)) {
    // Three different answers: the panel could not agree.
    await dispute.update({ status: 'escalated' });
    await notifyAdmins(ctx, 'Dispute needs an admin', 'A mediation panel could not reach a majority.');
  }
  return (await Dispute.findByPk(disputeId)) as Dispute;
};

/** An admin decides an escalated dispute, or overrides an open one. Both are recorded. */
export const adminResolve = async (
  ctx: AppContext,
  { disputeId, adminId, outcome, note }: { disputeId: string; adminId: string; outcome: string; note?: string },
): Promise<Dispute> => {
  if (!OUTCOMES.includes(outcome as DisputeOutcome)) throw new HttpError('Unknown outcome', 400);
  const text = String(note ?? '').trim();
  if (text.length < 5) throw new HttpError('Record why, so the decision can be reviewed later', 400);
  const dispute = await Dispute.findByPk(disputeId);
  if (!dispute) throw new HttpError('Dispute not found', 404);
  if (!['open', 'escalated'].includes(dispute.status)) throw new HttpError('This dispute is closed', 409);
  await decide(ctx, dispute, outcome as DisputeOutcome, { decidedBy: 'admin', adminId, adminNote: text });
  return (await Dispute.findByPk(disputeId)) as Dispute;
};

/** Hands disputes the panel did not decide in time to an admin. */
export const escalateOverdue = async (ctx: AppContext, now: Date = new Date()): Promise<number> => {
  const [count] = await Dispute.update(
    { status: 'escalated' },
    { where: { status: 'open', deadlineAt: { [Op.lte]: now } } },
  );
  if (count > 0) {
    await notifyAdmins(ctx, 'Disputes need an admin', `${count} dispute(s) were not decided in 5 days.`);
  }
  return count;
};

const DISPUTE_INCLUDES = [
  {
    model: Match,
    as: 'match',
    include: [
      { model: Gig, as: 'gig', include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
      { model: User, as: 'worker', attributes: ['id', 'name'] },
      { model: Transaction, as: 'transaction', attributes: ['amount', 'currency', 'escrowStatus'] },
    ],
  },
  { model: User, as: 'openedBy', attributes: ['id', 'name'] },
  {
    model: DisputeVote,
    as: 'votes',
    include: [{ model: User, as: 'mediator', attributes: ['id', 'name'] }],
  },
];

/**
 * Disputes a user can see, shaped for what they may know.
 *
 * Votes are hidden from everyone until the dispute closes, so no mediator can
 * follow another's lead and no party can lobby a mediator who has voted. A
 * mediator sees only their own vote meanwhile.
 */
export const listFor = async (userId: string, role: string) => {
  const all = await Dispute.findAll({ include: DISPUTE_INCLUDES, order: [['createdAt', 'DESC']] });
  type Loaded = Dispute & {
    match?: (Match & { gig?: Gig & { client?: User }; worker?: User }) | null;
    votes?: (DisputeVote & { mediator?: User })[];
  };
  return (all as Loaded[])
    .map((d) => {
      const isParty = d.match?.workerId === userId || d.match?.gig?.clientId === userId;
      const seat = d.votes?.find((v) => v.mediatorId === userId);
      const isAdmin = role === 'admin';
      if (!isParty && !seat && !isAdmin) return null;
      const closed = d.status === 'decided' || d.status === 'settled';
      const json = d.toJSON() as Record<string, unknown>;
      json.votes = (d.votes ?? []).map((v) => {
        const visible = closed || isAdmin || v.mediatorId === userId;
        return {
          id: v.id,
          // Mediators stay anonymous to the parties; a mediator or admin sees names.
          mediator: isParty && !isAdmin ? null : (v.mediator ? { id: v.mediator.id, name: v.mediator.name } : null),
          voted: Boolean(v.vote),
          vote: visible ? v.vote : null,
          rationale: visible ? v.rationale : null,
          withMajority: closed ? v.withMajority : null,
        };
      });
      json.myRole = isAdmin ? 'admin' : seat ? 'mediator' : 'party';
      return json;
    })
    .filter(Boolean);
};

/** How many disputes a user has helped decide, and how often they sided with the outcome. */
export const mediatorRecord = async (userId: string) => {
  const seats = await DisputeVote.findAll({ where: { mediatorId: userId, withMajority: { [Op.ne]: null } } });
  return { decided: seats.length, withMajority: seats.filter((s) => s.withMajority).length };
};
