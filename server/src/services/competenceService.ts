import { UserSkill, SkillTask, Match, Gig, Review } from '../models';
import type { Provenance } from '../types/domain';
import type { CompetenceResult, ProvenanceDetail } from '../types/scoring';

/**
 * How a competence claim was established, and what that is worth.
 *
 * The same claim — "I am a level-4 bridal tailor" — carries very different
 * information depending on how it came to be recorded. Signalling theory says a
 * signal is only credible in proportion to how hard it is to fake, so the tiers
 * are ordered by exactly that, and the platform tells the reader which tier it
 * is rather than flattening everything into one "verified" badge.
 *
 * self_declared is deliberately nonzero. A four-to-six week pilot starts with
 * almost nobody verified, and scoring an unproven worker at zero would make
 * them unrankable — reproducing the cold-start exclusion this platform exists
 * to break.
 */
const TIERS: Record<Provenance, number> = {
  self_declared: 0.15,
  document_sighted: 0.5,
  peer_reviewed: 0.8,
  work_earned: 1,
};

const TIER_ORDER = [
  'self_declared',
  'document_sighted',
  'peer_reviewed',
  'work_earned',
] as const satisfies readonly Provenance[];

// Completed, reviewed jobs in this skill before the work itself is treated as
// the credential. One job is an anecdote.
const JOBS_FOR_WORK_EARNED = 3;

const rank = (tier: Provenance) => TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);

/**
 * Recomputes provenance and strength for one worker-skill pair.
 *
 * Monotonic by construction: the tier is the highest one the evidence
 * supports, so adding evidence can raise a claim but never quietly demote a
 * worker who has done nothing wrong.
 */
export const recalculate = async (
  userId: string,
  skillId: string,
  { trigger = null }: { trigger?: string | null } = {},
): Promise<CompetenceResult | null> => {
  const userSkill = await UserSkill.findOne({ where: { userId, skillId } });
  if (!userSkill) return null;

  const [approvedDemonstrations, sightedCertificates, completedJobs] = await Promise.all([
    SkillTask.count({
      where: { workerId: userId, skillId, status: 'approved', kind: 'demonstration' },
    }),
    SkillTask.count({
      where: { workerId: userId, skillId, status: 'approved', kind: 'certificate' },
    }),
    Match.count({
      where: { workerId: userId, status: 'completed' },
      include: [{ model: Gig, as: 'gig', where: { skillId }, required: true }],
    }),
  ]);

  // Only jobs the client actually reviewed count toward work_earned: an
  // unreviewed completion is the worker's own word about their own work.
  const reviewedJobs = completedJobs
    ? await Review.count({
        where: { recipientId: userId },
        include: [
          {
            model: Match,
            as: 'match',
            required: true,
            where: { workerId: userId, status: 'completed' },
            include: [{ model: Gig, as: 'gig', where: { skillId }, required: true }],
          },
        ],
      })
    : 0;

  let provenance: Provenance = 'self_declared';
  if (reviewedJobs >= JOBS_FOR_WORK_EARNED) {
    provenance = 'work_earned';
  } else if (approvedDemonstrations > 0) {
    provenance = 'peer_reviewed';
  } else if (sightedCertificates > 0) {
    provenance = 'document_sighted';
  }

  // Never step down from a tier already recorded. Evidence can go stale, but a
  // worker should not lose standing because a count moved.
  if (rank(userSkill.provenance) > rank(provenance)) {
    provenance = userSkill.provenance;
  }

  const detail: ProvenanceDetail = {
    approvedDemonstrations,
    sightedCertificates,
    completedJobs,
    reviewedJobs,
    jobsForWorkEarned: JOBS_FOR_WORK_EARNED,
    computedAt: new Date().toISOString(),
    trigger,
  };

  await userSkill.update({
    provenance,
    provenanceDetail: detail,
    credentialStrength: TIERS[provenance],
  });

  return { provenance, credentialStrength: TIERS[provenance], detail };
};

/** Recomputes every skill a worker holds, e.g. after a job completes. */
export const recalculateAllFor = async (
  userId: string,
  { trigger = null }: { trigger?: string | null } = {},
): Promise<(CompetenceResult | null)[]> => {
  const skills = await UserSkill.findAll({ where: { userId }, attributes: ['skillId'] });
  return Promise.all(skills.map((s) => recalculate(userId, s.skillId, { trigger })));
};

export { TIERS, TIER_ORDER, JOBS_FOR_WORK_EARNED };
