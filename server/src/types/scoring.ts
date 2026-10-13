/**
 * The scoring contracts.
 *
 * These are not merely service return types. Each one is written verbatim into
 * a JSONB column, so the producer and the store must name the same type or
 * they can drift with nothing to catch it:
 *
 *   ScoredPair      → Match.scoreBreakdown, GigApplication.scoreBreakdown
 *   TrustBreakdown  → User.trustScoreBreakdown, TrustScoreSnapshot.components
 *
 * These columns are the pilot's data. A change here is a change to what the
 * dissertation reports, not just to a signature.
 */
import type { Provenance } from './domain';

/**
 * One weighted input to a score.
 *
 * `value` is the raw 0–1 signal, `weight` its share of the profile, and
 * `contribution` their product — carried rather than recomputed so a reader can
 * check the arithmetic without knowing the formula.
 */
export interface ScoreComponent {
  key: string;
  weight: number;
  value: number;
  contribution: number;
  detail?: Record<string, unknown>;
}

/**
 * An i18n key plus its parameters, never a rendered sentence — a worker reading
 * Kinyarwanda gets the same account of a ranking as one reading English.
 *
 * `key` stays `string` rather than a union: several are built by template
 * interpolation over a status or provenance tier, and pinning them to literals
 * would mean re-deriving those templates in the type system for no gain.
 */
export interface ScoreReason {
  key: string;
  params: Record<string, string | number>;
}

/**
 * The weight profile as the scorer consumes it.
 *
 * Declared structurally because `resolveProfile` returns either a
 * MatchWeightProfile row or the in-code FALLBACK_PROFILE literal, which has a
 * null id and is used when no profile row exists. Both conform to this.
 *
 * `weights` is deliberately open: a profile may carry a key this version does
 * not compute, and the scorer drops it rather than contributing NaN.
 */
export interface WeightProfileShape {
  id: string | null;
  name: string;
  weights: Record<string, number>;
  distanceHalfLifeKm: number;
  maxDistanceKm: number;
}

/** What `matchScoringService.scorePair` returns, and what a match stores. */
export interface ScoredPair {
  workerId: string;
  score: number;
  /** Carried so a caller can tell an unproven worker from an established one
   *  without re-querying inside a ranking loop. */
  reviewCount: number;
  provenance: Provenance | null;
  eligibleForInvite: boolean;
  beyondRange: boolean;
  distanceKm: number | null;
  components: ScoreComponent[];
  reasons: ScoreReason[];
  weightProfile: Pick<WeightProfileShape, 'id' | 'name' | 'weights'>;
}

/** A scored pair once `rankCandidates` has placed it. */
export interface RankedPair extends ScoredPair {
  rank: number;
}

/** Per-component spread across a candidate set — how RQ2 sees whether one
 *  component is drowning another. */
export interface ComponentVariance {
  min: number;
  max: number;
  range: number;
  mean: number;
  stdDev: number;
  weight: number;
  effectiveInfluence: number;
}

/** The three inputs to a trust score, discriminated by `key` so each carries
 *  its own evidence. */
export type TrustComponent =
  | (ScoreComponent & {
      key: 'rating';
      detail: {
        reviewCount: number;
        rawMean: number | null;
        recencyWeightedMean: number | null;
        shrunkMean: number;
        effectiveReviewWeight: number;
      };
    })
  | (ScoreComponent & {
      key: 'completion';
      detail: { completed: number; abandoned: number; smoothedRate: number };
    })
  | (ScoreComponent & {
      key: 'verification';
      detail: { verifiedSkills: number; forFullCredit: number };
    });

/**
 * What `trustScoreService.recalculate` returns.
 *
 * `isProvisional` must not be dropped by any caller: a worker with no reviews
 * is *unrated*, not badly rated, and rendering the bare number as though it
 * were earned is the misreading the flag exists to prevent.
 */
export interface TrustBreakdown {
  formulaVersion: string;
  score: number;
  isProvisional: boolean;
  components: TrustComponent[];
  penalty: {
    key: 'recentAbandonment';
    value: number;
    detail: { recentAbandoned: number; windowDays: number };
  };
  computedAt: string;
}

/** What `competenceService.recalculate` records on a UserSkill. */
export interface ProvenanceDetail {
  approvedDemonstrations: number;
  sightedCertificates: number;
  completedJobs: number;
  reviewedJobs: number;
  /** Paid jobs where a verified lead endorsed the holder as their apprentice. */
  supervisedJobs?: number;
  jobsForWorkEarned: number;
  computedAt: string;
  trigger: string | null;
}

/** What `competenceService.recalculate` returns. */
export interface CompetenceResult {
  provenance: Provenance;
  credentialStrength: number;
  detail: ProvenanceDetail;
}
