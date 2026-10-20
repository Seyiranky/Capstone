/**
 * The closed string sets the domain actually uses.
 *
 * Every union here is transcribed by hand from an `isIn` validator on a model,
 * because the columns are `DataTypes.STRING` rather than `DataTypes.ENUM` and
 * so carry no type information of their own. The validators stay where they
 * are: they are the runtime check on data arriving from the network, which a
 * compile-time type cannot perform.
 *
 * Keep each union and its validator in step. If they drift, the validator wins
 * at runtime and the type is simply a lie.
 */

/** User.role */
export type Role = 'worker' | 'client' | 'admin';

/** User.status */
export type UserStatus = 'active' | 'suspended';

/** User.preferredLanguage — the two locales the interface ships in. */
export type Language = 'en' | 'rw';

/**
 * User.experimentArm — RQ3 between-subjects assignment. Null until the client
 * claims an arm from the pre-generated allocation list.
 */
export type ExperimentArm = 'provenance' | 'plain';

/**
 * User.reviewerTier — the capability to review skill submissions, held
 * independently of `role`. Peer reviewers are workers, which is what makes the
 * pool large enough for rotation to mean anything.
 */
export type ReviewerTier = 'admin' | 'peer';

/** Gig.status */
export type GigStatus =
  | 'pending_review'
  | 'open'
  | 'matched'
  | 'completed'
  | 'cancelled'
  | 'rejected';

/** GigApplication.status */
export type GigApplicationStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'withdrawn';

/**
 * GigApplication.rejectionReason. `choseAnother` is also what every sibling
 * application gets when the gig is filled, since that is exactly what happened.
 */
export type RejectionReason = 'skillLevel' | 'distance' | 'timing' | 'choseAnother' | 'other';
export const REJECTION_REASONS: RejectionReason[] = ['skillLevel', 'distance', 'timing', 'choseAnother', 'other'];

/** Match.status */
export type MatchStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

/** Who called off a job that had been accepted. */
export type CancelledVia = 'worker' | 'client' | 'dispute';

/** A Mobile Money attempt that failed, kept when the client tries again (RQ4 counts attempts). */
export interface PaymentAttempt {
  provider: string;
  providerReference: string | null;
  providerStatus: string | null;
  failureReason: string | null;
  payerMsisdn: string | null;
  amount: number;
  requestedAt: string;
  settledAt: string | null;
}

/** Match.origin — which path produced the match, and the RQ2 comparison axis. */
/** manual: an approved application; ranked: invited from the shortlist; direct: a client invited this worker. */
export type MatchOrigin = 'manual' | 'ranked' | 'direct';

/**
 * Match.invitationReason — an invitation received through the reserved
 * exploration slot is not evidence the ranking chose that worker, so the two
 * are recorded separately and never pooled in the acceptance rate.
 */
export type InvitationReason = 'ranked' | 'exploration';

/** Skill.category — the four trades the pilot covers. */
export type SkillCategory = 'electronics_repair' | 'tailoring' | 'tutoring' | 'digital_web';

/** Skill.kind — a category, or a specialisation sitting under one. */
export type SkillKind = 'category' | 'specialisation';

/** UserSkill.verificationStatus */
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

/**
 * UserSkill.provenance — how a competence claim was established, in ascending
 * credibility. `document_sighted` means a rotated reviewer *saw* the document;
 * it does not mean the award behind it is genuine, and no copy should imply so.
 */
/**
 * How a skill claim was established. `supervised` sits just above self-declared:
 * a verified worker endorsed the holder after a paid job together. Real, but not
 * independent, so it is never treated as a peer review.
 */
export type Provenance = 'self_declared' | 'supervised' | 'document_sighted' | 'peer_reviewed' | 'work_earned';

/** MatchMember.role — people on a job besides its lead worker. */
export type MemberRole = 'crew' | 'apprentice';
export type MemberStatus = 'invited' | 'joined' | 'declined';
export type PayoutRole = 'lead' | MemberRole;

/** A crew member named on an application, with their agreed share of the pay. */
export interface CrewEntry {
  userId: string;
  sharePercent: number;
}

/** SkillTask.status */
export type SkillTaskStatus = 'pending' | 'approved' | 'rejected';

/** SkillTask.kind — one column, and the reason certificates inherit rotation. */
export type SkillTaskKind = 'demonstration' | 'certificate';

/** SkillTaskAssignment.status */
export type AssignmentStatus = 'pending' | 'approved' | 'rejected' | 'recused' | 'expired';
export type RecusalReason = 'knowsWorker' | 'conflict' | 'notQualified';

/** SkillTaskAppeal.status */
export type AppealStatus = 'open' | 'upheld' | 'dismissed';

/** SkillTaskEvidence.kind */
export type EvidenceKind = 'photo' | 'video' | 'voice' | 'link' | 'document';

/** Transaction.status */
export type TransactionStatus = 'initiated' | 'confirmed' | 'failed';

/**
 * Transaction.escrowStatus — what has happened to money once it is collected.
 *
 * Kept apart from TransactionStatus, which is the provider's settlement and is
 * driven by callbacks. `none` covers a payment not yet collected (or that
 * failed); `held` is collected but not yet the worker's.
 */
export type EscrowStatus = 'none' | 'held' | 'released' | 'refunded';

/** Match.completedVia — how a match came to be completed and its escrow released. */
export type CompletionMethod = 'code' | 'client' | 'auto' | 'dispute';

/** Dispute.status — `escalated` waits on an admin; `settled` closed by the parties themselves. */
export type DisputeStatus = 'open' | 'escalated' | 'decided' | 'settled';

/** What happens to the held money. */
export type DisputeOutcome = 'release' | 'refund' | 'split';

export type DisputeReason = 'notDone' | 'poorQuality' | 'noShow' | 'notReleased' | 'notPaid' | 'notMarkedDone' | 'other';
/** Where the job stood when the dispute was opened; decides what each outcome means. */
export type DisputeStage = 'in_progress' | 'awaiting_payment' | 'paid';

/** Who closed a dispute. */
export type DisputeDecider = 'mediators' | 'admin' | 'parties';

/** NotificationDelivery.channel */
export type DeliveryChannel = 'in_app' | 'sms' | 'email';

/**
 * User.preferredChannel — the one off-app channel a user has chosen.
 *
 * In-app is never opted out of, so it is absent here: this names what is
 * delivered *in addition* to it. Exclusive rather than a set of flags because
 * two independent booleans can describe states the UI cannot produce.
 */
export type PreferredChannel = 'none' | 'email' | 'sms';

/**
 * What kind of notice a notification is, which is what decides its channels.
 *
 * A controller knows the meaning of the event it is reporting; it should not
 * also have to know which transports that meaning deserves. `lib/channels/policy.ts`
 * maps these to channels, so the fan-out can be narrowed in one place.
 */
export type NotificationCategory = 'activity' | 'outcome' | 'critical';

/**
 * NotificationDelivery.status — `skipped` is load-bearing: a pilot reporting
 * delivery has to tell "did not want SMS" apart from "tried and failed".
 * `delivered` only ever comes from a carrier's report; `sent` means the gateway
 * accepted the message and nothing more.
 */
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'skipped';

/** What `verifyToken` attaches to the request. */
export interface AuthUser {
  id: string;
  role: Role;
  reviewerTier: ReviewerTier | null;
  /** Issued-at / expiry, carried through from the JWT payload. */
  iat?: number;
  exp?: number;
}
