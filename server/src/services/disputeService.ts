import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Request } from 'express';
import { Dispute, DisputeVote, Gig, Match, Transaction, User, sequelize } from '../models';
import * as escrowService from './escrowService';
import * as collusionDetectionService from './collusionDetectionService';
import {
  PEER_MIN_REVIEWS,
  PEER_MIN_TRUST_SCORE,
  pastCollaborators,
} from './skillVerificationService';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import type { DisputeOutcome, DisputeReason } from '../types/domain';

/**
 * Disputes over escrowed money, decided by three screened peers.
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
export const DISPUTE_REASONS: DisputeReason[] = ['notDone', 'poorQuality', 'noShow', 'notReleased', 'other'];
export const OUTCOMES: DisputeOutcome[] = ['release', 'refund', 'split'];
const DETAILS_MAX = 2000;

const loadMatch = async (matchId: string): Promise<MatchWithGig | null> =>
  (await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] })) as MatchWithGig | null;

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

/** Opens a dispute on a job whose money is held, and seats its panel. */
export const open = async (
  ctx: AppContext,
  { matchId, userId, reason, details }: { matchId: string; userId: string; reason: string; details: string },
): Promise<Dispute> => {
  const match = await loadMatch(matchId);
  if (!match || !match.gig) throw new HttpError('Match not found', 404);
  const isParty = match.workerId === userId || match.gig.clientId === userId;
  if (!isParty) throw new HttpError('Only the worker or the client on this job may open a dispute', 403);
  if (match.status !== 'accepted') throw new HttpError('Only a job in progress can be disputed', 409);
  if (!DISPUTE_REASONS.includes(reason as DisputeReason)) throw new HttpError('Unknown reason', 400);
  const text = String(details ?? '').trim();
  if (text.length < 10) throw new HttpError('Explain what happened in a sentence or two', 400);

  const tx = await Transaction.findOne({ where: { matchId } });
  if (!tx || tx.status !== 'confirmed' || tx.escrowStatus !== 'held') {
    throw new HttpError('There is no money in escrow to dispute yet', 409);
  }
  if (await escrowService.hasLiveDispute(matchId)) {
    throw new HttpError('A dispute is already open on this job', 409);
  }

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
    body: `A dispute was opened on "${match.gig.title}". Payment is frozen. Add your side so the mediators hear both.`,
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
 * Applies an outcome to the held money and closes the dispute.
 *
 * Release and split complete the job (a split pays the worker half); refund
 * calls it off and returns the money. Runs once: a dispute already closed is
 * left alone.
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
  if (outcome === 'refund') {
    await match.update({ status: 'cancelled' });
    await escrowService.refund(match.id);
    await match.gig.update({ status: 'cancelled' });
  } else {
    await escrowService.completeMatch(ctx, match, 'dispute', { share: outcome === 'split' ? 0.5 : 1 });
  }

  const summary =
    outcome === 'release'
      ? 'the payment goes to the worker'
      : outcome === 'refund'
        ? 'the payment goes back to the client'
        : 'the payment is split equally';
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
