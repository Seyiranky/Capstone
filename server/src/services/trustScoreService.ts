import { Review, User, Match, Gig, UserSkill, TrustScoreSnapshot } from '../models';
import type { Role } from '../types/domain';
import type { TrustBreakdown, TrustComponent } from '../types/scoring';

const FORMULA_VERSION = 'v3-bayesian-2026-09';

// Reviews lose half their weight every 6 months, so a worker is judged on who
// they are now rather than who they were two years ago.
const RECENCY_HALF_LIFE_DAYS = 180;

// Shrinkage toward a neutral prior. C is expressed in "effective reviews": a
// worker needs roughly this many before their own average dominates the prior.
// This is what stops one 5-star review from outranking twenty 4.8s.
//
// C=3 rather than 5 deliberately. At 5, a 4-6 week pilot produces so few
// reviews per worker that every score sits on the prior and the trust component
// has almost no variance — which would make RQ2 measure the compression of this
// input rather than how much trustworthiness actually matters. 3 still resists
// a single glowing review while letting a modest record separate people.
const PRIOR_MEAN = 3.5;
const PRIOR_STRENGTH = 3;

// Laplace-style smoothing so a single completed job does not read as a perfect
// 100% completion rate.
const COMPLETION_SMOOTHING_SUCCESS = 2;
const COMPLETION_SMOOTHING_TOTAL = 4;

// One verified skill earns full credit. At 2, every worker in a four-category
// marketplace held exactly one and the component contributed an identical
// constant to everyone — weight spent on something that discriminated nothing.
const VERIFIED_SKILLS_FOR_FULL_CREDIT = 1;

const RECENT_ABANDONMENT_WINDOW_DAYS = 90;
const ABANDONMENTS_FOR_FULL_PENALTY = 3;
const MAX_ABANDONMENT_PENALTY = 0.25;

const DAY_MS = 1000 * 60 * 60 * 24;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ComponentKey = 'rating' | 'completion' | 'verification';

// Components are declared with the roles they apply to. Weights are
// renormalised over whichever components apply, so a client is not capped at
// 80% of the scale merely for having no verifiable trade skills.
const COMPONENT_WEIGHTS: Record<ComponentKey, { weight: number; roles: Role[] }> = {
  rating: { weight: 0.55, roles: ['worker', 'client', 'admin'] },
  completion: { weight: 0.25, roles: ['worker', 'client', 'admin'] },
  verification: { weight: 0.2, roles: ['worker'] },
};

/** A component before its weight is applied. */
interface RawComponent<D> {
  normalised: number;
  detail: D;
}

type RatingDetail = Extract<TrustComponent, { key: 'rating' }>['detail'];
type CompletionDetail = Extract<TrustComponent, { key: 'completion' }>['detail'];
type VerificationDetail = Extract<TrustComponent, { key: 'verification' }>['detail'];

const ratingComponent = (
  reviews: Pick<Review, 'rating' | 'createdAt'>[],
  now: Date,
): RawComponent<RatingDetail> => {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const review of reviews) {
    const ageDays = (now.getTime() - review.createdAt.getTime()) / DAY_MS;
    const weight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    weightedSum += weight * review.rating;
    weightTotal += weight;
  }

  const shrunk = (weightedSum + PRIOR_MEAN * PRIOR_STRENGTH) / (weightTotal + PRIOR_STRENGTH);

  return {
    normalised: clamp(shrunk / 5, 0, 1),
    detail: {
      reviewCount: reviews.length,
      rawMean: reviews.length
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null,
      recencyWeightedMean: weightTotal ? weightedSum / weightTotal : null,
      shrunkMean: shrunk,
      effectiveReviewWeight: weightTotal,
    },
  };
};

const completionComponent = (
  completed: number,
  abandoned: number,
): RawComponent<CompletionDetail> => {
  const rate =
    (completed + COMPLETION_SMOOTHING_SUCCESS) /
    (completed + abandoned + COMPLETION_SMOOTHING_TOTAL);
  return {
    normalised: clamp(rate, 0, 1),
    detail: { completed, abandoned, smoothedRate: rate },
  };
};

const verificationComponent = (verifiedSkills: number): RawComponent<VerificationDetail> => ({
  normalised: clamp(verifiedSkills / VERIFIED_SKILLS_FOR_FULL_CREDIT, 0, 1),
  detail: { verifiedSkills, forFullCredit: VERIFIED_SKILLS_FOR_FULL_CREDIT },
});

/**
 * Counts a user's concluded commitments.
 *
 * Only abandonment *after* accepting counts against them, and only by the
 * person who called the job off: a client cancelling must not lower the
 * worker's rate, nor the reverse. A job a dispute called off counts against
 * neither; the decision is its own record. Rows from before the caller was
 * recorded (cancelledVia null) still count for both. Declining while the
 * match is still pending is legitimate — a worker saying "I'm not free that
 * week" is the honest answer, and penalising it would both punish good
 * behaviour and bias the acceptance-rate measure the pilot depends on.
 */
const jobCountsFor = async (user: User) => {
  const scope =
    user.role === 'client'
      ? { include: [{ model: Gig, as: 'gig', where: { clientId: user.id }, required: true }] }
      : { where: { workerId: user.id } };

  const matches = await Match.findAll({
    ...scope,
    attributes: ['id', 'status', 'acceptedAt', 'updatedAt', 'cancelledVia'],
  });
  const mine = user.role === 'client' ? 'client' : 'worker';

  const completed = matches.filter((m) => m.status === 'completed').length;
  const abandonedMatches = matches.filter(
    (m) => m.status === 'cancelled' && m.acceptedAt && (m.cancelledVia == null || m.cancelledVia === mine),
  );
  const cutoff = new Date(Date.now() - RECENT_ABANDONMENT_WINDOW_DAYS * DAY_MS);
  const recentAbandoned = abandonedMatches.filter((m) => m.updatedAt >= cutoff).length;

  return { completed, abandoned: abandonedMatches.length, recentAbandoned };
};

/**
 * Recomputes a user's trust score from every available signal and records an
 * immutable snapshot.
 *
 * Returns the score alongside its components so callers (and the UI) can show
 * *why* the number is what it is, rather than presenting an opaque figure.
 */
export const recalculate = async (
  userId: string,
  { trigger = null }: { trigger?: string | null } = {},
): Promise<TrustBreakdown | null> => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const now = new Date();

  const [reviews, jobCounts, verifiedSkills] = await Promise.all([
    Review.findAll({
      where: { recipientId: userId },
      attributes: ['rating', 'createdAt'],
    }),
    jobCountsFor(user),
    UserSkill.count({ where: { userId, verificationStatus: 'verified' } }),
  ]);

  const computed = {
    rating: ratingComponent(reviews, now),
    completion: completionComponent(jobCounts.completed, jobCounts.abandoned),
    verification: verificationComponent(verifiedSkills),
  };

  const applicable = (Object.entries(COMPONENT_WEIGHTS) as [ComponentKey, { weight: number; roles: Role[] }][]).filter(
    ([, meta]) => meta.roles.includes(user.role),
  );
  const weightTotal = applicable.reduce((sum, [, meta]) => sum + meta.weight, 0);

  const components = applicable.map(([key, meta]) => {
    const normalisedWeight = meta.weight / weightTotal;
    return {
      key,
      weight: normalisedWeight,
      value: computed[key].normalised,
      contribution: normalisedWeight * computed[key].normalised,
      detail: computed[key].detail,
    };
  }) as TrustComponent[];

  const penalty =
    MAX_ABANDONMENT_PENALTY *
    clamp(jobCounts.recentAbandoned / ABANDONMENTS_FOR_FULL_PENALTY, 0, 1);

  const positive = components.reduce((sum, component) => sum + component.contribution, 0);
  const score = 5 * clamp(positive - penalty, 0, 1);

  // A worker with no reviews is *unrated*, not badly rated. Callers must render
  // this as "new" rather than showing a bare mid-scale number.
  const isProvisional = reviews.length === 0;

  const breakdown: TrustBreakdown = {
    formulaVersion: FORMULA_VERSION,
    score,
    isProvisional,
    components,
    penalty: {
      key: 'recentAbandonment',
      value: penalty,
      detail: {
        recentAbandoned: jobCounts.recentAbandoned,
        windowDays: RECENT_ABANDONMENT_WINDOW_DAYS,
      },
    },
    computedAt: now.toISOString(),
  };

  await user.update({
    trustScore: score,
    trustScoreBreakdown: breakdown,
    trustScoreUpdatedAt: now,
    reviewCount: reviews.length,
    completedJobCount: jobCounts.completed,
    abandonedJobCount: jobCounts.abandoned,
  });

  await TrustScoreSnapshot.create({
    userId,
    score,
    components: breakdown,
    formulaVersion: FORMULA_VERSION,
    trigger,
  });

  return breakdown;
};

export { FORMULA_VERSION, PRIOR_MEAN, PRIOR_STRENGTH };
