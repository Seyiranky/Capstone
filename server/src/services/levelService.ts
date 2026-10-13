import { Payout, Skill, Transaction, UserSkill } from '../models';
import type { User } from '../models';

/**
 * Worker levels — New, Rising, Trusted, Master — with every criterion public.
 *
 * Fiverr's seller levels and Upwork's Job Success Score decide a worker's
 * standing by rules the worker cannot fully see. Here each level lists what it
 * takes and where the worker stands on each, so a level is something to work
 * towards rather than a verdict to guess at. Every input is a record the
 * platform already holds: paid jobs, reviews, verified skills, abandonment.
 */

export type LevelKey = 'new' | 'rising' | 'trusted' | 'master';

export interface Criterion {
  key: string;
  value: number;
  target: number;
  met: boolean;
}

export interface LevelStep {
  key: Exclude<LevelKey, 'new'>;
  reached: boolean;
  criteria: Criterion[];
}

export interface WorkerLevel {
  level: LevelKey;
  next: Exclude<LevelKey, 'new'> | null;
  steps: LevelStep[];
}

const at = (key: string, value: number, target: number, atMost = false): Criterion => ({
  key,
  value,
  target,
  met: atMost ? value <= target : value >= target,
});

export const forWorker = async (
  user: Pick<User, 'id' | 'trustScore' | 'reviewCount' | 'trustScoreBreakdown'>,
): Promise<WorkerLevel> => {
  const [paidJobs, verified, workEarned] = await Promise.all([
    Payout.count({
      where: { userId: user.id },
      include: [{ model: Transaction, as: 'transaction', required: true, where: { escrowStatus: 'released' } }],
    }),
    UserSkill.count({ where: { userId: user.id, verificationStatus: 'verified' } }),
    UserSkill.count({
      where: { userId: user.id, provenance: 'work_earned' },
      include: [{ model: Skill, as: 'skill', required: true }],
    }),
  ]);
  const reviews = user.reviewCount ?? 0;
  // A provisional score (too few reviews) never counts toward a level.
  const trust = reviews >= 3 ? Number(user.trustScore) : 0;
  const breakdown = user.trustScoreBreakdown as { penalty?: { detail?: { recentAbandoned?: number } } } | null;
  const abandoned = breakdown?.penalty?.detail?.recentAbandoned ?? 0;

  const steps: LevelStep[] = [
    { key: 'rising', reached: false, criteria: [at('paidJobs', paidJobs, 1)] },
    {
      key: 'trusted',
      reached: false,
      criteria: [
        at('paidJobs', paidJobs, 5),
        at('trust', Math.round(trust * 10) / 10, 4),
        at('verifiedSkills', verified, 1),
        at('recentAbandoned', abandoned, 0, true),
      ],
    },
    {
      key: 'master',
      reached: false,
      criteria: [
        at('paidJobs', paidJobs, 20),
        at('trust', Math.round(trust * 10) / 10, 4.5),
        at('workEarned', workEarned, 1),
        at('recentAbandoned', abandoned, 0, true),
      ],
    },
  ];

  // Levels are cumulative: a level counts only if every one below it does.
  let level: LevelKey = 'new';
  for (const step of steps) {
    step.reached = step.criteria.every((c) => c.met);
    if (!step.reached) break;
    level = step.key;
  }
  const next = steps.find((s) => !s.reached)?.key ?? null;
  return { level, next, steps };
};
