import { Op } from 'sequelize';
import { User, UserSkill, Skill, Match, MatchWeightProfile } from '../models';
import type {
  ComponentVariance,
  RankedPair,
  ScoreComponent,
  ScoreReason,
  ScoredPair,
  WeightProfileShape,
} from '../types/scoring';
import type { VerificationStatus } from '../types/domain';
import type { Gig } from '../models/Gig';

const EARTH_RADIUS_KM = 6371;

// Used only if no profile row is present (e.g. a bare test database). The
// migration seeds 'balanced' with these same values.
const FALLBACK_PROFILE: WeightProfileShape = {
  id: null,
  name: 'balanced',
  weights: { distance: 0.3, trust: 0.3, skillFit: 0.3, availability: 0.1 },
  distanceHalfLifeKm: 3,
  maxDistanceKm: 15,
};

// Verified beats claimed beats absent. A worker with no record of the skill is
// still allowed to apply — they simply score zero here and are told why — but
// they are never proactively invited.
//
// This status factor moves out of skillFit and into a credentials component in
// the next phase, so that "does this worker do this work" and "how well
// established is the claim" stop being conflated.
const SKILL_FIT_BY_STATUS: Record<VerificationStatus, number> = {
  verified: 1,
  pending: 0.6,
  unverified: 0.4,
};
const SKILL_FIT_ABSENT = 0;

/**
 * The status factor, defaulting when the column holds something unexpected.
 *
 * The constant above is exhaustive over VerificationStatus, so a new status
 * added to the union fails to compile until it is given a factor. The fallback
 * covers the other direction: the column is a STRING with an isIn validator, so
 * a row written before that validator existed could still carry anything.
 */
const skillFitFor = (status: string): number =>
  SKILL_FIT_BY_STATUS[status as VerificationStatus] ?? SKILL_FIT_ABSENT;

// How closely the worker's skill matches what the gig asked for. A sibling
// specialisation still scores well: a tailor who does school uniforms can
// plausibly hem curtains, and excluding them would be a filter by another name.
const SPECIFICITY = {
  exact: 1,
  sibling: 0.7,
  parentOnly: 0.5,
};

/** The subset of a Skill the scorer reads — a gig's own skill, or a lookup. */
type GigSkillRef = Pick<Skill, 'id' | 'parentId'> & Partial<Pick<Skill, 'name'>>;

/** A UserSkill with its Skill eagerly loaded, which specificityFor depends on. */
type WorkerSkill = UserSkill & { skill?: Skill | null };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * How well a worker's proficiency meets what the gig asked for.
 *
 * With no stated requirement, level still matters a little — a level-5 and a
 * level-1 worker should not rank identically, which they did until now. With a
 * requirement, the shortfall is proportional and never hard-excludes.
 */
const levelFit = (effectiveLevel: number, requiredLevel: number | null | undefined) => {
  if (!requiredLevel) return clamp(0.7 + 0.06 * effectiveLevel, 0, 1);
  return clamp(effectiveLevel / requiredLevel, 0, 1);
};

/**
 * The level a client's stated requirement is measured against.
 *
 * Only a reviewer-set level counts. A worker who self-declares a skill can
 * claim any level they like, and if that cleared a client's bar the field would
 * mean nothing within a week — reviewer-set is the only reason `proficiencyLevel`
 * carries information.
 */
const effectiveLevelFor = (workerSkill: WorkerSkill | null | undefined) =>
  workerSkill?.verificationStatus === 'verified' ? (workerSkill.proficiencyLevel ?? 1) : 1;

/** Exact specialisation, sibling under the same parent, or category-level only. */
const specificityFor = (
  workerSkill: WorkerSkill | null | undefined,
  gigSkill: GigSkillRef | null | undefined,
): number | null => {
  if (!workerSkill || !gigSkill) return null;
  if (workerSkill.skillId === gigSkill.id) return SPECIFICITY.exact;
  // Both are specialisations beneath the same category.
  if (
    workerSkill.skill?.parentId &&
    gigSkill.parentId &&
    workerSkill.skill.parentId === gigSkill.parentId
  ) {
    return SPECIFICITY.sibling;
  }
  // One side named the category, the other a specialisation within it.
  if (workerSkill.skill?.parentId === gigSkill.id || workerSkill.skillId === gigSkill.parentId) {
    return SPECIFICITY.parentOnly;
  }
  return null;
};

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
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
const distanceScore = (km: number | null, halfLifeKm: number) =>
  km === null ? null : clamp(Math.pow(0.5, km / halfLifeKm), 0, 1);

const availabilityScore = (activeMatches: number) => {
  if (activeMatches === 0) return 1;
  if (activeMatches === 1) return 0.5;
  return 0;
};

export const resolveProfile = async (name?: string): Promise<WeightProfileShape> => {
  const profile = name
    ? await MatchWeightProfile.findOne({ where: { name } })
    : await MatchWeightProfile.findOne({ where: { isActive: true } });
  return profile || FALLBACK_PROFILE;
};

interface ScorePairInput {
  worker: User;
  gig: Gig;
  profile: WeightProfileShape;
  workerSkill?: WorkerSkill | null;
  activeMatches: number;
  gigSkill?: GigSkillRef | null;
}

/**
 * Scores one (worker, gig) pair.
 *
 * Returns the total alongside every component and a set of i18n reason keys.
 * Reasons are keys plus parameters, never rendered sentences, so the client can
 * show the explanation in the viewer's own language — a worker reading
 * Kinyarwanda must get the same account of the ranking as one reading English.
 */
export const scorePair = ({
  worker,
  gig,
  profile,
  workerSkill,
  activeMatches,
  gigSkill,
}: ScorePairInput): ScoredPair => {
  const weights = profile.weights;

  const km =
    worker.locationLat != null && worker.locationLng != null
      ? haversineKm(worker.locationLat, worker.locationLng, gig.locationLat, gig.locationLng)
      : null;

  const specificity = specificityFor(workerSkill, gigSkill ?? { id: gig.skillId, parentId: null });
  const status = workerSkill ? skillFitFor(workerSkill.verificationStatus) : SKILL_FIT_ABSENT;
  const effectiveLevel = effectiveLevelFor(workerSkill);
  const level = levelFit(effectiveLevel, gig.requiredLevel);

  const fit = specificity === null ? SKILL_FIT_ABSENT : specificity * level * status;

  const raw: Record<string, number> = {
    // No saved location is scored as neutral rather than zero, so a worker who
    // has not set a location is not silently buried.
    distance: km === null ? 0.5 : (distanceScore(km, profile.distanceHalfLifeKm) as number),
    trust: clamp(worker.trustScore / 5, 0, 1),
    skillFit: fit,
    // How well established the claim is, as opposed to how well it fits. Kept
    // separate from skillFit so verification is not counted twice, and so both
    // components keep variance of their own.
    credentials: specificity === null ? 0 : clamp(workerSkill?.credentialStrength ?? 0.15, 0, 1),
    availability: availabilityScore(activeMatches),
  };

  // Only weights with a matching signal become components. A profile carrying a
  // key this version does not compute would otherwise contribute NaN and
  // silently poison every total.
  const components: ScoreComponent[] = Object.entries(weights)
    .filter(([key]) => raw[key] !== undefined)
    .map(([key, weight]) => ({
      key,
      weight,
      value: raw[key] as number,
      contribution: weight * (raw[key] as number),
    }));

  const total = components.reduce((sum, component) => sum + component.contribution, 0);
  const beyondRange = km !== null && km > profile.maxDistanceKm;

  const reasons: ScoreReason[] = [];
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
    params: { skill: workerSkill?.skill?.name ?? '' },
  });

  // Says how the claim was established, not just that it was. A client reading
  // "sighted" rather than "verified" is the point: the platform saw a document,
  // it did not authenticate the award behind it.
  if (workerSkill?.provenance && specificity !== null) {
    reasons.push({
      key: `match.reason.provenance.${workerSkill.provenance}`,
      params: {},
    });
  }

  if (specificity === SPECIFICITY.sibling) {
    reasons.push({ key: 'match.reason.relatedSpecialisation', params: {} });
  } else if (specificity === SPECIFICITY.parentOnly) {
    reasons.push({ key: 'match.reason.categoryOnly', params: {} });
  }

  // A client who set a bar is told when someone falls under it, rather than the
  // worker quietly sinking down the list. Only meaningful for someone who has
  // the skill at all: telling a client an electrician is "below level 5" for a
  // tailoring job buries the actual reason.
  if (gig.requiredLevel && specificity !== null) {
    reasons.push({
      key:
        effectiveLevel >= gig.requiredLevel
          ? 'match.reason.levelMeets'
          : 'match.reason.levelBelow',
      params: { level: effectiveLevel, required: gig.requiredLevel },
    });
  } else if (workerSkill?.verificationStatus === 'verified') {
    reasons.push({ key: 'match.reason.level', params: { level: effectiveLevel } });
  }

  if (activeMatches > 0) {
    reasons.push({ key: 'match.reason.busy', params: { activeMatches } });
  }

  return {
    workerId: worker.id,
    score: total,
    // Carried so callers can tell an unproven worker from an established one
    // without re-querying inside a ranking loop.
    reviewCount: worker.reviewCount ?? 0,
    provenance: workerSkill?.provenance ?? null,
    eligibleForInvite: !beyondRange && fit > SKILL_FIT_ABSENT,
    beyondRange,
    distanceKm: km === null ? null : Number(km.toFixed(2)),
    components,
    reasons,
    weightProfile: { id: profile.id, name: profile.name, weights },
  };
};

const activeMatchCounts = async (workerIds: string[]): Promise<Map<string, number>> => {
  if (workerIds.length === 0) return new Map();
  const rows = await Match.findAll({
    where: { workerId: { [Op.in]: workerIds }, status: { [Op.in]: ['pending', 'accepted'] } },
    attributes: ['workerId'],
  });
  return rows.reduce(
    (map, row) => map.set(row.workerId, (map.get(row.workerId) || 0) + 1),
    new Map<string, number>(),
  );
};

/**
 * The gig's skill plus everything adjacent to it.
 *
 * A worker whose specialisation sits beside the one requested is a real
 * candidate, so the lookup has to span the family rather than demand an exact
 * id — otherwise sibling scoring could never fire.
 */
const skillFamily = async (gigSkill: GigSkillRef | null | undefined): Promise<string[]> => {
  if (!gigSkill) return [];
  const parentId = gigSkill.parentId ?? gigSkill.id;
  const relatives = await Skill.findAll({
    where: { [Op.or]: [{ id: parentId }, { parentId }] },
    attributes: ['id'],
  });
  return relatives.map((row) => row.id);
};

/** Each worker's best-matching skill for this gig, richest match first. */
const skillsByWorker = async (
  workerIds: string[],
  gigSkill: GigSkillRef | null | undefined,
): Promise<Map<string, WorkerSkill>> => {
  if (workerIds.length === 0) return new Map();
  const familyIds = await skillFamily(gigSkill);
  if (familyIds.length === 0) return new Map();

  const rows = (await UserSkill.findAll({
    where: { userId: { [Op.in]: workerIds }, skillId: { [Op.in]: familyIds } },
    include: [{ model: Skill, as: 'skill', attributes: ['id', 'name', 'parentId', 'category'] }],
  })) as WorkerSkill[];

  const best = new Map<string, WorkerSkill>();
  for (const row of rows) {
    const rank = specificityFor(row, gigSkill) ?? 0;
    const current = best.get(row.userId);
    if (!current || rank > (specificityFor(current, gigSkill) ?? 0)) {
      best.set(row.userId, row);
    }
  }
  return best;
};

interface ScoreWorkersInput {
  gig: Gig;
  workers: User[];
  profileName?: string;
}

/** Scores specific workers against a gig. */
export const scoreWorkers = async ({
  gig,
  workers,
  profileName,
}: ScoreWorkersInput): Promise<ScoredPair[]> => {
  const profile = await resolveProfile(profileName);
  const workerIds = workers.map((worker) => worker.id);
  const gigSkill =
    gig.skill ?? (await Skill.findByPk(gig.skillId, { attributes: ['id', 'name', 'parentId'] }));
  const [counts, skills] = await Promise.all([
    activeMatchCounts(workerIds),
    skillsByWorker(workerIds, gigSkill),
  ]);

  return workers
    .map((worker) =>
      scorePair({
        worker,
        gig,
        gigSkill,
        profile,
        workerSkill: skills.get(worker.id) || null,
        activeMatches: counts.get(worker.id) || 0,
      }),
    )
    .sort((a, b) => b.score - a.score);
};

/**
 * Spread of each component across a candidate set.
 *
 * A weight only has ranking influence in proportion to how much its input
 * actually varies. If trust ranges 0.2 while distance ranges 0.7, then equal
 * weights do not mean equal influence — so any comparison of weight profiles
 * (RQ2) has to be read against these figures rather than the weights alone.
 */
export const componentVariance = (scored: ScoredPair[]): Record<string, ComponentVariance> => {
  if (scored.length === 0) return {};
  const keys = scored[0].components.map((c) => c.key);
  return Object.fromEntries(
    keys.map((key) => {
      const values = scored.map((s) => (s.components.find((c) => c.key === key) as ScoreComponent).value);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      const weight = (scored[0].components.find((c) => c.key === key) as ScoreComponent).weight;
      const range = Math.max(...values) - Math.min(...values);
      return [
        key,
        {
          min: Number(Math.min(...values).toFixed(3)),
          max: Number(Math.max(...values).toFixed(3)),
          range: Number(range.toFixed(3)),
          mean: Number(mean.toFixed(3)),
          stdDev: Number(Math.sqrt(variance).toFixed(3)),
          weight,
          // How far this component can move a score in practice, as opposed to
          // how much weight it nominally carries.
          effectiveInfluence: Number((weight * range).toFixed(3)),
        },
      ];
    }),
  );
};

interface RankCandidatesInput {
  gig: Gig;
  profileName?: string;
  limit?: number;
}

/**
 * Ranks every active worker as a candidate for a gig.
 *
 * Candidates who cannot be invited — no relevant skill, or beyond the service
 * radius — sort below those who can, regardless of score. A weighted sum will
 * happily put a nearby, well-reviewed electrician above the only qualified
 * tailor, and showing that at the top of a client's list is misleading. They
 * stay listed with their explanation rather than being filtered out.
 */
export const rankCandidates = async ({
  gig,
  profileName,
  limit,
}: RankCandidatesInput): Promise<RankedPair[]> => {
  const workers = await User.findAll({ where: { role: 'worker', status: 'active' } });
  const scored = await scoreWorkers({ gig, workers, profileName });

  const ranked = scored
    .sort((a, b) => {
      if (a.eligibleForInvite !== b.eligibleForInvite) return a.eligibleForInvite ? -1 : 1;
      return b.score - a.score;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  return limit ? ranked.slice(0, limit) : ranked;
};

export const scoreOne = async ({
  gig,
  worker,
  profileName,
}: {
  gig: Gig;
  worker: User;
  profileName?: string;
}): Promise<ScoredPair> => {
  const [scored] = await scoreWorkers({ gig, workers: [worker], profileName });
  return scored;
};
