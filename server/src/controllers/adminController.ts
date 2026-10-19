import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import { User, Gig, GigApplication, Skill, Match, Transaction, UserSkill, NotificationDelivery, Payout, Dispute, sequelize } from '../models';
import * as rateService from '../services/rateService';
import { canApply } from '../services/applicationEligibility';
import * as applicationOversight from '../services/applicationOversight';
import * as safeVisitService from '../services/safeVisitService';
import * as sms from '../lib/channels/sms';
import notify from '../lib/notify';
import * as pilotMetricsService from '../services/pilotMetricsService';
import * as matchScoringService from '../services/matchScoringService';
import * as collusionDetectionService from '../services/collusionDetectionService';
import * as skillVerificationService from '../services/skillVerificationService';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import type { InvitationReason, ReviewerTier } from '../types/domain';
import type { RankedPair } from '../types/scoring';

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await User.findAll({ order: [['createdAt', 'DESC']] });
  res.json(users.map((u) => u.privateJSON()));
};

export const listGigs = async (_req: Request, res: Response): Promise<void> => {
  const gigs = await Gig.findAll({
    include: [
      { model: User, as: 'client' },
      { model: Skill, as: 'skill' },
      {
        model: Match,
        as: 'matches',
        include: [
          { model: User, as: 'worker' },
          { model: Transaction, as: 'transaction' },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
  res.json(gigs);
};

export const listFlagged = async (_req: Request, res: Response): Promise<void> => {
  const report = await collusionDetectionService.report();
  res.json(report);
};

/**
 * Enrols or removes a reviewer.
 *
 * Peer reviewers must themselves be verified and well rated: someone with no
 * verified skill has no standing to certify another worker's.
 */
export const setReviewerTier = async (req: Request, res: Response): Promise<void> => {
  const { reviewerTier } = req.body ?? {};
  if (![null, 'admin', 'peer'].includes(reviewerTier ?? null)) {
    res.status(400).json({ message: "reviewerTier must be 'admin', 'peer' or null" });
    return;
  }

  const user = await User.findByPk(pathParam(req, 'id'));
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (reviewerTier === 'peer') {
    if (user.role !== 'worker') {
      res.status(400).json({ message: 'Only workers can be enrolled as peer reviewers' });
      return;
    }
    const verifiedSkills = await UserSkill.count({
      where: { userId: user.id, verificationStatus: 'verified' },
    });
    if (verifiedSkills === 0) {
      res.status(409).json({ message: 'A peer reviewer must have at least one verified skill' });
      return;
    }
    if (user.trustScore < skillVerificationService.PEER_MIN_TRUST_SCORE) {
      res.status(409).json({
        message: `A peer reviewer needs a trust score of at least ${skillVerificationService.PEER_MIN_TRUST_SCORE}`,
      });
      return;
    }
    if (user.reviewCount < skillVerificationService.PEER_MIN_REVIEWS) {
      res.status(409).json({
        message: `A peer reviewer needs at least ${skillVerificationService.PEER_MIN_REVIEWS} reviews, not a score resting on the prior`,
      });
      return;
    }
  }

  await user.update({ reviewerTier: (reviewerTier ?? null) as ReviewerTier | null });

  if (reviewerTier) {
    await notify(req, {
      userId: user.id,
      title: 'You are now a skill reviewer',
      body: 'You can review skill submissions from other workers. Submissions are assigned to you automatically.',
    });
  }

  res.json(user.privateJSON());
};

export const listReviewers = async (_req: Request, res: Response): Promise<void> => {
  const reviewers = await User.findAll({
    where: { reviewerTier: { [Op.not]: null } },
    order: [['name', 'ASC']],
  });
  res.json(reviewers.map((u) => u.privateJSON()));
};

export const pilotMetrics = async (req: Request, res: Response): Promise<void> => {
  const from = stringParam(req, 'from');
  const to = stringParam(req, 'to');
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    res.status(400).json({ message: 'from and to must be valid dates' });
    return;
  }

  const metrics = await pilotMetricsService.collect({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  res.json(metrics);
};

/** An admin marks a live gig sensitive, or clears the mark, at any time. */
/** Applications that need an admin's look: overdue, on sensitive gigs, or flagged. */
export const applicationsOverview = async (req: Request, res: Response): Promise<void> => {
  res.json(await applicationOversight.overview({ all: req.query.all === '1' }));
};

export const applicationsFlaggedCount = async (_req: Request, res: Response): Promise<void> => {
  res.json({ count: await applicationOversight.flaggedCount() });
};

export const withdrawApplication = async (req: Request, res: Response): Promise<void> => {
  res.json(await applicationOversight.withdraw(req, pathParam(req, 'id'), req.body?.reason));
};

export const setGigSensitive = async (req: Request, res: Response): Promise<void> => {
  const gig = await Gig.findByPk(pathParam(req, 'id'));
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  if (typeof req.body?.sensitive !== 'boolean') {
    res.status(400).json({ message: 'sensitive must be true or false' });
    return;
  }
  await gig.update({ sensitive: req.body.sensitive, sensitiveBy: req.body.sensitive ? 'admin' : null });
  res.json(gig);
};

export const reviewGig = async (req: Request, res: Response): Promise<void> => {
  const { decision, note } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  // An optional reason for a rejection, passed to the client so they can fix and repost.
  const reason = typeof note === 'string' ? note.trim().slice(0, 280) : '';

  const gig = await Gig.findByPk(pathParam(req, 'id'));
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  if (gig.status !== 'pending_review') {
    res.status(409).json({ message: 'This gig has already been reviewed' });
    return;
  }

  // The admin can mark a gig sensitive (or clear it) as they approve it.
  const sensitive =
    typeof req.body?.sensitive === 'boolean' && req.body.sensitive !== gig.sensitive
      ? { sensitive: req.body.sensitive as boolean, sensitiveBy: req.body.sensitive ? ('admin' as const) : null }
      : {};
  await gig.update(
    decision === 'approved' ? { status: 'open', openedAt: new Date(), ...sensitive } : { status: 'rejected' },
  );

  await notify(req, {
    userId: gig.clientId,
    title: decision === 'approved' ? 'Gig approved' : 'Gig rejected',
    body:
      decision === 'approved'
        ? `Your gig "${gig.title}" was approved and is now live for workers to apply to.`
        : `Your gig "${gig.title}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    // A decision on work the client submitted and is waiting on.
    category: 'outcome',
  });

  const invitations = decision === 'approved' ? await inviteRankedCandidates(req, gig) : [];

  res.json({ ...gig.toJSON(), invitations });
};

// Size of the ranked shortlist invited when a gig goes live. Set to 0 to run a
// pilot arm with manual applications only. Read per call so the arm can be
// switched without a restart.
const rankedInviteLimit = () => Number(process.env.RANKED_INVITE_LIMIT ?? 3);

/**
 * Invites the top-ranked eligible workers to a newly opened gig.
 *
 * These matches are born 'pending' with origin 'ranked', which is what gives
 * the pilot an acceptance rate to compare against the manual application arm
 * (RQ2). The full score breakdown is frozen onto each match so a ranking stays
 * reproducible after the weight profile is retuned.
 */
// One slot of the shortlist is held for a worker without a track record.
// Set to 0 to run a control arm with pure ranking.
const explorationSlots = () => Number(process.env.EXPLORATION_SLOTS ?? 1);

/** A ranked candidate, tagged with why they made the shortlist. */
type Shortlisted = RankedPair & { invitationReason: InvitationReason };

/**
 * Picks the shortlist, reserving a slot for someone unproven.
 *
 * Ranking alone would invite the same established handful indefinitely:
 * credentials and trust both require completed work, and completed work
 * requires being invited. Over a short pilot most participants would never be
 * reached, so the data would come from a few people and everyone else would
 * experience nothing happening.
 *
 * The reserved slot is the *last* one — it never displaces a better-ranked
 * worker — and falls back to the next-ranked candidate when no newcomer is
 * eligible, so an invitation is never wasted.
 */
const buildShortlist = (eligible: RankedPair[], limit: number): Shortlisted[] => {
  const reserved = Math.min(explorationSlots(), Math.max(limit - 1, 0));
  if (reserved === 0) {
    return eligible
      .slice(0, limit)
      .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }));
  }

  const earned = eligible
    .slice(0, limit - reserved)
    .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }));
  const taken = new Set(earned.map((c) => c.workerId));

  const newcomers = eligible.filter(
    (c) =>
      !taken.has(c.workerId) &&
      (c.reviewCount ?? 0) < skillVerificationService.PEER_MIN_REVIEWS,
  );
  const explorers = newcomers
    .slice(0, reserved)
    .map((c) => ({ ...c, invitationReason: 'exploration' as InvitationReason }));

  // No unproven candidate to promote: give the slot back to the ranking.
  const shortfall = reserved - explorers.length;
  const filler = shortfall
    ? eligible
        .filter((c) => !taken.has(c.workerId) && !explorers.some((e) => e.workerId === c.workerId))
        .slice(0, shortfall)
        .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }))
    : [];

  return [...earned, ...explorers, ...filler];
};

const inviteRankedCandidates = async (req: Request, gig: Gig): Promise<Match[]> => {
  const limit = rankedInviteLimit();
  if (limit <= 0) return [];

  const candidates = await matchScoringService.rankCandidates({ gig });
  const fitting = candidates.filter(
    (candidate) => candidate.eligibleForInvite && candidate.workerId !== gig.clientId,
  );
  // An invitation is an offer to apply on the worker's behalf, so it follows
  // the same rules as applying: nobody is invited to a gig they could not apply to.
  const people = await User.findAll({ where: { id: fitting.map((c) => c.workerId) } });
  const byId = new Map(people.map((p) => [p.id, p]));
  const eligible = [];
  for (const candidate of fitting) {
    const worker = byId.get(candidate.workerId);
    if (worker && (await canApply(gig, worker)).eligible) eligible.push(candidate);
  }
  const shortlist = buildShortlist(eligible, limit);

  const invitations: Match[] = [];
  for (const candidate of shortlist) {
    const match = await Match.create({
      gigId: gig.id,
      workerId: candidate.workerId,
      status: 'pending',
      origin: 'ranked',
      invitationReason: candidate.invitationReason,
      rankScore: candidate.score,
      scoreBreakdown: candidate,
      weightProfileId: candidate.weightProfile.id,
    });
    await notify(req, {
      userId: candidate.workerId,
      title: 'You were matched to a new gig',
      body: `"${gig.title}" looks like a fit for you. Confirm if you can take it.`,
    });
    invitations.push(match);
  }

  return invitations;
};

export const moderateUser = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { action } = req.body ?? {};
  if (!['suspend', 'activate'].includes(action)) {
    res.status(400).json({ message: "action must be 'suspend' or 'activate'" });
    return;
  }

  const user = await User.findByPk(pathParam(req, 'id'));
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (user.role === 'admin') {
    res.status(403).json({ message: 'Admins cannot be suspended' });
    return;
  }
  if (user.id === caller.id) {
    res.status(403).json({ message: 'You cannot moderate your own account' });
    return;
  }

  await user.update({ status: action === 'suspend' ? 'suspended' : 'active' });

  await notify(req, {
    userId: user.id,
    title: action === 'suspend' ? 'Account suspended' : 'Account reactivated',
    body:
      action === 'suspend'
        ? 'An administrator has suspended your account. Contact support if you believe this is a mistake.'
        : 'Your account has been reactivated. You can log in again.',
    // Losing or regaining access, which an in-app notice cannot reach someone
    // to tell them about once they are suspended.
    category: 'critical',
  });

  res.json(user.privateJSON());
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(pathParam(req, 'id'));
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (user.role === 'admin') {
    res.status(403).json({ message: 'Admins cannot be deleted' });
    return;
  }
  if (user.id === caller.id) {
    res.status(403).json({ message: 'You cannot delete your own account' });
    return;
  }

  await user.destroy();
  res.json({ message: 'User deleted' });
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether SMS is reaching people, and what it costs, over the last seven days.
 *
 * The figure a pilot report needs is reach, not attempts, so "sent" is split
 * by what the carrier said afterwards. Pindo does not retry a missed delivery
 * report, so a message still `sent` a day later is counted on its own rather
 * than assumed delivered.
 */
export const smsHealth = async (_req: Request, res: Response): Promise<void> => {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const where = { channel: 'sms' as const, createdAt: { [Op.gte]: since } };

  const [byStatus, totals, noReport, usersOnSms] = await Promise.all([
    NotificationDelivery.findAll({
      where,
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['status'],
      raw: true,
    }) as unknown as Promise<{ status: string; count: string }[]>,
    NotificationDelivery.findOne({
      where,
      attributes: [
        [sequelize.fn('SUM', sequelize.col('cost')), 'cost'],
        [sequelize.fn('AVG', sequelize.col('segments')), 'segments'],
      ],
      raw: true,
    }) as unknown as Promise<{ cost: string | null; segments: string | null } | null>,
    NotificationDelivery.count({
      where: { ...where, status: 'sent', sentAt: { [Op.lt]: new Date(Date.now() - DAY_MS) } },
    }),
    User.count({ where: { preferredChannel: 'sms', phoneVerifiedAt: { [Op.ne]: null } } }),
  ]);

  const counts: Record<string, number> = { sent: 0, delivered: 0, failed: 0, skipped: 0 };
  for (const row of byStatus) counts[row.status] = Number(row.count);

  const balance = sms.lastKnownBalance();
  res.json({
    since,
    driver: sms.driverName(),
    sender: process.env.SMS_SENDER_ID || 'Isoko',
    usersOnSms,
    counts,
    noReportAfter24h: noReport,
    cost: totals?.cost === null || totals?.cost === undefined ? 0 : Number(totals.cost),
    averageSegments: totals?.segments ? Number(Number(totals.segments).toFixed(2)) : null,
    balance: balance ? { amount: balance.amount, at: balance.at } : null,
  });
};

/**
 * Why applications are turned down, by skill.
 *
 * "Skill level" counts concentrated in one skill point at where training or
 * verification is needed; "distance" counts at where workers are missing.
 * Applications closed because someone else was chosen are reported apart, as
 * they say nothing about the applicant.
 */
export const rejectionReasons = async (_req: Request, res: Response): Promise<void> => {
  const rows = (await GigApplication.findAll({
    where: { status: 'rejected', rejectionReason: { [Op.ne]: null } },
    attributes: ['rejectionReason'],
    include: [{ model: Gig, as: 'gig', attributes: ['skillId'], include: [{ model: Skill, as: 'skill', attributes: ['name'] }] }],
  })) as (GigApplication & { gig?: Gig & { skill?: Skill | null } })[];

  const bySkill = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const skill = row.gig?.skill?.name ?? 'Other';
    const counts = bySkill.get(skill) ?? {};
    counts[row.rejectionReason as string] = (counts[row.rejectionReason as string] ?? 0) + 1;
    bySkill.set(skill, counts);
  }
  res.json(
    [...bySkill.entries()]
      .map(([skill, counts]) => ({ skill, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => (b.counts.skillLevel ?? 0) - (a.counts.skillLevel ?? 0) || b.total - a.total),
  );
};

/**
 * Money on the platform at a glance: what is waiting to be collected, held in
 * escrow, paid out and refunded, plus the latest transactions with their
 * receipts. Amounts are totals of the transactions in each state.
 */
/**
 * Admin: Mobile Money payments.
 *
 * Paid jobs, payments waiting on the client to approve on their phone, finished
 * jobs not yet paid, failed attempts, and whether each worker's share reached
 * their MoMo number. The payer's number is shown masked.
 */
export const payments = async (_req: Request, res: Response): Promise<void> => {
  const transactions = (await Transaction.findAll({
    include: [
      {
        model: Match,
        as: 'match',
        attributes: ['id', 'workerId', 'status', 'completedVia', 'completedAt'],
        include: [
          { model: Gig, as: 'gig', attributes: ['id', 'title'], include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
          { model: User, as: 'worker', attributes: ['id', 'name'] },
        ],
      },
      { model: Payout, as: 'payouts', attributes: ['id', 'transferStatus'] },
    ],
    order: [['updatedAt', 'DESC']],
  })) as (Transaction & { match?: Match & { gig?: Gig & { client?: User }; worker?: User }; payouts?: Payout[] })[];

  type State = 'paid' | 'pending' | 'failed';
  const stateOf = (tx: Transaction): State =>
    tx.status === 'failed' || tx.escrowStatus === 'refunded' ? 'failed' : tx.status === 'initiated' ? 'pending' : 'paid';
  const totals: Record<State | 'awaiting', { count: number; amount: number }> = {
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 },
    awaiting: { count: 0, amount: 0 },
  };
  for (const tx of transactions) {
    const t = totals[stateOf(tx)];
    t.count += 1;
    t.amount += Number(tx.releasedAmount ?? tx.amount);
  }

  // Finished jobs the client has not paid yet (no payment, or only a failed one).
  const settled = new Set(transactions.filter((tx) => tx.status !== 'failed').map((tx) => tx.matchId));
  const done = (await Match.findAll({
    where: { status: 'completed' },
    attributes: ['id', 'agreedAmount', 'completedAt', 'updatedAt'],
    include: [
      { model: Gig, as: 'gig', attributes: ['id', 'title', 'budget'], include: [{ model: User, as: 'client', attributes: ['id', 'name'] }] },
      { model: User, as: 'worker', attributes: ['id', 'name'] },
    ],
  })) as (Match & { gig?: Gig & { client?: User }; worker?: User })[];
  const awaiting = done
    .filter((m) => !settled.has(m.id) && m.gig)
    .map((m) => ({
      matchId: m.id,
      amount: Number(m.agreedAmount ?? m.gig!.budget),
      since: m.completedAt ?? m.updatedAt,
      gig: { id: m.gig!.id, title: m.gig!.title },
      client: m.gig!.client ? { id: m.gig!.client.id, name: m.gig!.client.name } : null,
      worker: m.worker ? { id: m.worker.id, name: m.worker.name } : null,
    }))
    .sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
  totals.awaiting = { count: awaiting.length, amount: awaiting.reduce((sum, a) => sum + a.amount, 0) };

  const transfers = { sent: 0, not_sent: 0, failed: 0, no_number: 0 } as Record<string, number>;
  for (const p of await Payout.findAll({ attributes: ['transferStatus'] })) transfers[p.transferStatus] = (transfers[p.transferStatus] ?? 0) + 1;

  const mask = (msisdn: string | null) => (msisdn ? `${msisdn.slice(0, 6)}••••${msisdn.slice(-2)}` : null);
  const provider = process.env.PAYMENT_PROVIDER || 'simulated-momo';

  res.json({
    provider: {
      name: provider,
      environment: provider === 'mtn-momo' ? process.env.MOMO_TARGET_ENV || 'sandbox' : 'simulation',
    },
    totals,
    transfers,
    liveDisputes: await Dispute.count({ where: { status: ['open', 'escalated'] } }),
    awaiting: awaiting.slice(0, 20),
    recent: transactions.slice(0, 50).map((tx) => ({
      id: tx.id,
      state: stateOf(tx),
      amount: Number(tx.releasedAmount ?? tx.amount),
      extras: Number(tx.safetyNetContribution ?? 0) + Number(tx.coverPremium ?? 0),
      currency: tx.currency,
      provider: tx.provider,
      paidInAdvance: tx.escrowStatus === 'held',
      refunded: tx.escrowStatus === 'refunded',
      payer: mask(tx.payerMsisdn),
      failureReason: tx.failureReason,
      receiptNumber: tx.receiptNumber,
      transfer: tx.payouts?.length
        ? tx.payouts.every((p) => p.transferStatus === 'sent')
          ? 'sent'
          : tx.payouts.some((p) => p.transferStatus === 'failed')
            ? 'failed'
            : tx.payouts.some((p) => p.transferStatus === 'no_number')
              ? 'no_number'
              : 'not_sent'
        : null,
      updatedAt: tx.updatedAt,
      gig: tx.match?.gig ? { id: tx.match.gig.id, title: tx.match.gig.title } : null,
      client: tx.match?.gig?.client ? { id: tx.match.gig.client.id, name: tx.match.gig.client.name } : null,
      worker: tx.match?.worker ? { id: tx.match.worker.id, name: tx.match.worker.name } : null,
    })),
  });
};

/** The usual price range for every trade, for the market view. */
export const rates = async (_req: Request, res: Response): Promise<void> => {
  const categories = (await Skill.findAll({ where: { parentId: null }, attributes: ['name', 'category'] }));
  res.json(
    await Promise.all(
      categories.map(async (c) => ({ name: c.name, ...(await rateService.forCategory(c.category)) })),
    ),
  );
};

export const safetyAlerts = async (_req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.alerts());
};

export const resolveSafetyAlert = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.resolve(req, pathParam(req, 'id'), authed(req).id, req.body?.note));
};

export const acknowledgeSafetyAlert = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.acknowledge(req, pathParam(req, 'id'), authed(req).id));
};

export const openSafetyAlerts = async (_req: Request, res: Response): Promise<void> => {
  res.json({ count: await safeVisitService.openCount() });
};
