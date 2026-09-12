const { Op } = require('sequelize');
const { User, UserSkill, Match, MatchWeightProfile } = require('../models');

const EARTH_RADIUS_KM = 6371;

// Used only if no profile row is present (e.g. a bare test database). The
// migration seeds 'balanced' with these same values.
const FALLBACK_PROFILE = {
  id: null,
  name: 'balanced',
  weights: { distance: 0.3, trust: 0.3, skillFit: 0.3, availability: 0.1 },
  distanceHalfLifeKm: 3,
  maxDistanceKm: 15,
};

// Verified beats claimed beats absent. A worker with no record of the skill is
// still allowed to apply — they simply score zero here and are told why — but
// they are never proactively invited.
const SKILL_FIT_BY_STATUS = {
  verified: 1,
  pending: 0.6,
  unverified: 0.4,
};
const SKILL_FIT_ABSENT = 0;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toRad = (deg) => (deg * Math.PI) / 180;

const haversineKm = (aLat, aLng, bLat, bLng) => {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

/**
 * Proximity decays geometrically rather than linearly: the cost that matters to
 * a worker is the moto fare and travel time, where the first kilometre matters
 * far more than the tenth. With a 3km half-life, 0km scores 1.0, 3km scores
 * 0.5, 6km scores 0.25.
 */
const distanceScore = (km, halfLifeKm) =>
  km === null ? null : clamp(Math.pow(0.5, km / halfLifeKm), 0, 1);

const availabilityScore = (activeMatches) => {
  if (activeMatches === 0) return 1;
  if (activeMatches === 1) return 0.5;
  return 0;
};

exports.resolveProfile = async (name) => {
  const profile = name
    ? await MatchWeightProfile.findOne({ where: { name } })
    : await MatchWeightProfile.findOne({ where: { isActive: true } });
  return profile || FALLBACK_PROFILE;
};

/**
 * Scores one (worker, gig) pair.
 *
 * Returns the total alongside every component and a set of i18n reason keys.
 * Reasons are keys plus parameters, never rendered sentences, so the client can
 * show the explanation in the viewer's own language — a worker reading
 * Kinyarwanda must get the same account of the ranking as one reading English.
 */
exports.scorePair = ({ worker, gig, profile, workerSkill, activeMatches }) => {
  const weights = profile.weights;

  const km =
    worker.locationLat != null && worker.locationLng != null
      ? haversineKm(worker.locationLat, worker.locationLng, gig.locationLat, gig.locationLng)
      : null;

  const fit = workerSkill
    ? SKILL_FIT_BY_STATUS[workerSkill.verificationStatus] ?? SKILL_FIT_ABSENT
    : SKILL_FIT_ABSENT;

  const raw = {
    // No saved location is scored as neutral rather than zero, so a worker who
    // has not set a location is not silently buried.
    distance: km === null ? 0.5 : distanceScore(km, profile.distanceHalfLifeKm),
    trust: clamp(worker.trustScore / 5, 0, 1),
    skillFit: fit,
    availability: availabilityScore(activeMatches),
  };

  const components = Object.entries(weights).map(([key, weight]) => ({
    key,
    weight,
    value: raw[key],
    contribution: weight * raw[key],
  }));

  const total = components.reduce((sum, component) => sum + component.contribution, 0);
  const beyondRange = km !== null && km > profile.maxDistanceKm;

  const reasons = [];
  if (km === null) {
    reasons.push({ key: 'match.reason.noLocation', params: {} });
  } else {
    reasons.push({ key: 'match.reason.distance', params: { km: Number(km.toFixed(1)) } });
  }
  reasons.push({
    key: worker.reviewCount > 0 ? 'match.reason.trust' : 'match.reason.trustProvisional',
    params: { score: Number(worker.trustScore.toFixed(1)), reviews: worker.reviewCount ?? 0 },
  });
  reasons.push({
    key: workerSkill
      ? `match.reason.skill.${workerSkill.verificationStatus}`
      : 'match.reason.skill.absent',
    params: {},
  });
  if (activeMatches > 0) {
    reasons.push({ key: 'match.reason.busy', params: { activeMatches } });
  }

  return {
    workerId: worker.id,
    score: total,
    eligibleForInvite: !beyondRange && fit > SKILL_FIT_ABSENT,
    beyondRange,
    distanceKm: km === null ? null : Number(km.toFixed(2)),
    components,
    reasons,
    weightProfile: { id: profile.id, name: profile.name, weights },
  };
};

const activeMatchCounts = async (workerIds) => {
  if (workerIds.length === 0) return new Map();
  const rows = await Match.findAll({
    where: { workerId: { [Op.in]: workerIds }, status: { [Op.in]: ['pending', 'accepted'] } },
    attributes: ['workerId'],
  });
  return rows.reduce(
    (map, row) => map.set(row.workerId, (map.get(row.workerId) || 0) + 1),
    new Map(),
  );
};

const skillsByWorker = async (workerIds, skillId) => {
  if (workerIds.length === 0) return new Map();
  const rows = await UserSkill.findAll({ where: { userId: { [Op.in]: workerIds }, skillId } });
  return new Map(rows.map((row) => [row.userId, row]));
};

/** Scores specific workers against a gig. */
exports.scoreWorkers = async ({ gig, workers, profileName }) => {
  const profile = await exports.resolveProfile(profileName);
  const workerIds = workers.map((worker) => worker.id);
  const [counts, skills] = await Promise.all([
    activeMatchCounts(workerIds),
    skillsByWorker(workerIds, gig.skillId),
  ]);

  return workers
    .map((worker) =>
      exports.scorePair({
        worker,
        gig,
        profile,
        workerSkill: skills.get(worker.id) || null,
        activeMatches: counts.get(worker.id) || 0,
      }),
    )
    .sort((a, b) => b.score - a.score);
};

/** Ranks every active worker as a candidate for a gig. */
exports.rankCandidates = async ({ gig, profileName, limit }) => {
  const workers = await User.findAll({ where: { role: 'worker', status: 'active' } });
  const scored = await exports.scoreWorkers({ gig, workers, profileName });
  const ranked = scored.map((entry, index) => ({ ...entry, rank: index + 1 }));
  return limit ? ranked.slice(0, limit) : ranked;
};

exports.scoreOne = async ({ gig, worker, profileName }) => {
  const [scored] = await exports.scoreWorkers({ gig, workers: [worker], profileName });
  return scored;
};
