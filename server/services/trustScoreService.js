const { Review, User, Match, Gig, UserSkill, TrustScoreSnapshot } = require('../models');

const FORMULA_VERSION = 'v2-bayesian-2026-09';

// Reviews lose half their weight every 6 months, so a worker is judged on who
// they are now rather than who they were two years ago.
const RECENCY_HALF_LIFE_DAYS = 180;

// Shrinkage toward a neutral prior. C is expressed in "effective reviews": a
// worker needs roughly this many before their own average dominates the prior.
// This is what stops one 5-star review from outranking twenty 4.8s.
const PRIOR_MEAN = 3.5;
const PRIOR_STRENGTH = 5;

// Laplace-style smoothing so a single completed job does not read as a perfect
// 100% completion rate.
const COMPLETION_SMOOTHING_SUCCESS = 2;
const COMPLETION_SMOOTHING_TOTAL = 4;

const VERIFIED_SKILLS_FOR_FULL_CREDIT = 2;

const RECENT_ABANDONMENT_WINDOW_DAYS = 90;
const ABANDONMENTS_FOR_FULL_PENALTY = 3;
const MAX_ABANDONMENT_PENALTY = 0.25;

const DAY_MS = 1000 * 60 * 60 * 24;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Components are declared with the roles they apply to. Weights are
// renormalised over whichever components apply, so a client is not capped at
// 80% of the scale merely for having no verifiable trade skills.
const COMPONENT_WEIGHTS = {
  rating: { weight: 0.55, roles: ['worker', 'client', 'admin'] },
  completion: { weight: 0.25, roles: ['worker', 'client', 'admin'] },
  verification: { weight: 0.2, roles: ['worker'] },
};

const ratingComponent = (reviews, now) => {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const review of reviews) {
    const ageDays = (now - review.createdAt) / DAY_MS;
    const weight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    weightedSum += weight * review.rating;
    weightTotal += weight;
  }

  const shrunk =
    (weightedSum + PRIOR_MEAN * PRIOR_STRENGTH) / (weightTotal + PRIOR_STRENGTH);

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

const completionComponent = (completed, abandoned) => {
  const rate =
    (completed + COMPLETION_SMOOTHING_SUCCESS) /
    (completed + abandoned + COMPLETION_SMOOTHING_TOTAL);
  return {
    normalised: clamp(rate, 0, 1),
    detail: { completed, abandoned, smoothedRate: rate },
  };
};

const verificationComponent = (verifiedSkills) => ({
  normalised: clamp(verifiedSkills / VERIFIED_SKILLS_FOR_FULL_CREDIT, 0, 1),
  detail: { verifiedSkills, forFullCredit: VERIFIED_SKILLS_FOR_FULL_CREDIT },
});

/**
 * Counts a user's concluded commitments.
 *
 * Only abandonment *after* accepting counts against them. Declining while the
 * match is still pending is legitimate — a worker saying "I'm not free that
 * week" is the honest answer, and penalising it would both punish good
 * behaviour and bias the acceptance-rate measure the pilot depends on.
 */
const jobCountsFor = async (user) => {
  const scope =
    user.role === 'client'
      ? { include: [{ model: Gig, as: 'gig', where: { clientId: user.id }, required: true }] }
      : { where: { workerId: user.id } };

  const matches = await Match.findAll({
    ...scope,
    attributes: ['id', 'status', 'acceptedAt', 'updatedAt'],
  });

  const completed = matches.filter((m) => m.status === 'completed').length;
  const abandonedMatches = matches.filter((m) => m.status === 'cancelled' && m.acceptedAt);
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
exports.recalculate = async (userId, { trigger = null } = {}) => {
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

  const applicable = Object.entries(COMPONENT_WEIGHTS).filter(([, meta]) =>
    meta.roles.includes(user.role),
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
  });

  const penalty =
    MAX_ABANDONMENT_PENALTY *
    clamp(jobCounts.recentAbandoned / ABANDONMENTS_FOR_FULL_PENALTY, 0, 1);

  const positive = components.reduce((sum, component) => sum + component.contribution, 0);
  const score = 5 * clamp(positive - penalty, 0, 1);

  // A worker with no reviews is *unrated*, not badly rated. Callers must render
  // this as "new" rather than showing a bare mid-scale number.
  const isProvisional = reviews.length === 0;

  const breakdown = {
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

exports.FORMULA_VERSION = FORMULA_VERSION;
exports.PRIOR_MEAN = PRIOR_MEAN;
exports.PRIOR_STRENGTH = PRIOR_STRENGTH;
