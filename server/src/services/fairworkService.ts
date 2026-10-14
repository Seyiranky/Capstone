import { Op } from 'sequelize';
import {
  Dispute,
  Gig,
  GigApplication,
  Match,
  Payout,
  Skill,
  SkillTaskAppeal,
  Transaction,
  User,
} from '../models';
import * as rateService from './rateService';
import type { SkillCategory } from '../types/domain';

/**
 * Isoko scored against the five Fairwork principles, from its own records.
 *
 * Fairwork (Oxford Internet Institute) rates platforms on fair pay, conditions,
 * contracts, management and representation, two points each. It does so once a
 * year, from interviews and documents. This scores the same principles live,
 * and every check carries the number behind it and the bar it must clear, so a
 * reader can disagree with a threshold but not with the arithmetic. A check
 * the platform cannot yet meet is reported as not met, with the reason.
 */

export interface FairworkCheck {
  key: string;
  met: boolean;
  /** The measured value, as a ratio (0–1) or a count, per `unit`. */
  value: number | null;
  threshold: number;
  unit: 'ratio' | 'count' | 'days';
  /** How many records the value was computed from. */
  basis: number;
}

export interface FairworkPrinciple {
  key: 'pay' | 'conditions' | 'contracts' | 'management' | 'representation';
  checks: [FairworkCheck, FairworkCheck];
}

export interface FairworkScorecard {
  score: number;
  outOf: number;
  computedAt: string;
  principles: FairworkPrinciple[];
}

const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const check = (
  key: string,
  value: number | null,
  threshold: number,
  unit: FairworkCheck['unit'],
  basis: number,
  higherIsBetter = true,
): FairworkCheck => ({
  key,
  value,
  threshold,
  unit,
  basis,
  met: value != null && (higherIsBetter ? value >= threshold : value <= threshold),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export const compute = async (): Promise<FairworkScorecard> => {
  // Fair pay ────────────────────────────────────────────────────────────────
  // (1) Paid at or above the low end of the usual range for the trade.
  const payouts = (await Payout.findAll({
    where: { role: 'lead' },
    include: [
      { model: Transaction, as: 'transaction', required: true, where: { releasedAmount: null } },
      {
        model: Match,
        as: 'match',
        required: true,
        include: [{ model: Gig, as: 'gig', required: true, include: [{ model: Skill, as: 'skill' }] }],
      },
    ],
  })) as (Payout & { match?: Match & { gig?: Gig & { skill?: Skill | null } } })[];
  const floors = new Map<SkillCategory, number | null>();
  for (const p of payouts) {
    const category = p.match?.gig?.skill?.category;
    if (category && !floors.has(category)) floors.set(category, (await rateService.forCategory(category)).p25);
  }
  const atOrAbove = payouts.filter((p) => {
    const floor = floors.get(p.match?.gig?.skill?.category as SkillCategory);
    return floor == null || Number(p.amount) >= floor;
  }).length;

  // (2) No commission taken from workers' pay.
  const released = await Transaction.findAll({ where: { escrowStatus: 'released' }, attributes: ['platformFeeAmount'] });
  const feeFree = released.filter((t) => !t.platformFeeAmount || Number(t.platformFeeAmount) === 0).length;

  // Fair conditions ─────────────────────────────────────────────────────────
  // (1) Finished jobs the worker was actually paid for, through Isoko's Mobile Money.
  const completed = await Match.count({ where: { status: 'completed' } });
  const completedReleased = await Transaction.count({
    where: { escrowStatus: 'released' },
    include: [{ model: Match, as: 'match', required: true, where: { status: 'completed' } }],
  });
  // (2) Disputes decided within the 5 days promised.
  const disputes = await Dispute.findAll({ attributes: ['status', 'createdAt', 'decidedAt'] });
  const now = Date.now();
  const onTime = disputes.filter((d) =>
    d.decidedAt
      ? d.decidedAt.getTime() - d.createdAt.getTime() <= 5 * DAY_MS
      : now - d.createdAt.getTime() <= 5 * DAY_MS,
  ).length;

  // Fair contracts ──────────────────────────────────────────────────────────
  // (1) Every released job produced its payouts, each with a receipt anyone can check.
  const releasedTx = await Transaction.findAll({ where: { escrowStatus: 'released' }, attributes: ['id'] });
  const paidOut = new Set(
    (await Payout.findAll({ attributes: ['transactionId'] })).map((p) => p.transactionId),
  );
  const withReceipt = releasedTx.filter((tx) => paidOut.has(tx.id)).length;
  const payoutCount = releasedTx.length;
  // (2) Rankings explained: applications and ranked invitations carry their breakdown.
  const [apps, appsExplained, ranked, rankedExplained] = await Promise.all([
    GigApplication.count(),
    GigApplication.count({ where: { scoreBreakdown: { [Op.ne]: null } } }),
    Match.count({ where: { origin: 'ranked' } }),
    Match.count({ where: { origin: 'ranked', scoreBreakdown: { [Op.ne]: null } } }),
  ]);

  // Fair management ─────────────────────────────────────────────────────────
  // (1) Appeals against reviewers are decided, not left hanging past 14 days.
  const appeals = await SkillTaskAppeal.findAll({ attributes: ['status', 'createdAt'] });
  const appealsHandled = appeals.filter(
    (a) => a.status !== 'open' || now - a.createdAt.getTime() <= 14 * DAY_MS,
  ).length;
  // (2) Rejected applicants are told why.
  const [rejected, rejectedWithReason] = await Promise.all([
    GigApplication.count({ where: { status: 'rejected' } }),
    GigApplication.count({ where: { status: 'rejected', rejectionReason: { [Op.ne]: null } } }),
  ]);

  // Fair representation ─────────────────────────────────────────────────────
  // (1) Workers judge workers: peers enrolled as skill reviewers.
  const peers = await User.count({ where: { role: 'worker', reviewerTier: 'peer' } });
  // (2) Workers vote on platform rules. There is no way to do this, so honestly zero.
  const workerVotes = 0;

  const principles: FairworkPrinciple[] = [
    {
      key: 'pay',
      checks: [
        check('payAtFloor', ratio(atOrAbove, payouts.length), 0.8, 'ratio', payouts.length),
        check('noCommission', ratio(feeFree, released.length), 1, 'ratio', released.length),
      ],
    },
    {
      key: 'conditions',
      checks: [
        check('paidThroughIsoko', ratio(completedReleased, completed), 0.9, 'ratio', completed),
        check('disputesOnTime', disputes.length ? ratio(onTime, disputes.length) : 1, 0.9, 'ratio', disputes.length),
      ],
    },
    {
      key: 'contracts',
      checks: [
        check('receipts', ratio(withReceipt, payoutCount), 1, 'ratio', payoutCount),
        check('explained', ratio(appsExplained + rankedExplained, apps + ranked), 0.9, 'ratio', apps + ranked),
      ],
    },
    {
      key: 'management',
      checks: [
        check('appealsHandled', appeals.length ? ratio(appealsHandled, appeals.length) : 1, 0.9, 'ratio', appeals.length),
        check('reasonsGiven', rejected ? ratio(rejectedWithReason, rejected) : 1, 0.9, 'ratio', rejected),
      ],
    },
    {
      key: 'representation',
      checks: [
        check('peerReviewers', peers, 1, 'count', peers),
        check('workerVoice', workerVotes, 1, 'count', 0),
      ],
    },
  ];

  const score = principles.reduce((sum, p) => sum + p.checks.filter((c) => c.met).length, 0);
  return { score, outOf: 10, computedAt: new Date().toISOString(), principles };
};
