export type Role = 'worker' | 'client' | 'admin';
export type SkillCategory = 'electronics_repair' | 'tailoring' | 'tutoring' | 'digital_web';

export type UserStatus = 'active' | 'suspended';

/** One weighted input to a score, carried so the total can be explained. */
export interface ScoreComponent {
  key: string;
  weight: number;
  value: number;
  contribution: number;
  detail?: Record<string, unknown>;
}

/** An i18n key plus parameters, so explanations render in the viewer's language. */
export interface ScoreReason {
  key: string;
  params: Record<string, string | number>;
}

export interface TrustScoreBreakdown {
  formulaVersion: string;
  score: number;
  /** True when the user has no reviews yet: unrated, not badly rated. */
  isProvisional: boolean;
  components: ScoreComponent[];
  penalty: { key: string; value: number; detail?: Record<string, unknown> };
  computedAt: string;
}

export interface MatchScoreBreakdown {
  workerId: string;
  score: number;
  rank?: number;
  eligibleForInvite: boolean;
  beyondRange: boolean;
  distanceKm: number | null;
  components: ScoreComponent[];
  reasons: ScoreReason[];
  weightProfile: { id: string | null; name: string; weights: Record<string, number> };
}

export type PreferredChannel = 'none' | 'email' | 'sms';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  bio?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  trustScore: number;
  trustScoreBreakdown?: TrustScoreBreakdown | null;
  reviewCount?: number;
  completedJobCount?: number;
  preferredLanguage?: 'en' | 'rw';
  /** RQ3 arm. Null for workers, who see their own provenance either way. */
  experimentArm?: 'provenance' | 'plain' | null;
  experienceSummary?: string | null;
  yearsExperience?: number | null;
  phone?: string | null;
  /** Null until a texted code is confirmed; SMS is not sent before then. */
  phoneVerifiedAt?: string | null;
  /** The one off-app channel chosen. In-app is always on and so is not listed. */
  preferredChannel?: PreferredChannel;
  /** Null until the address is confirmed; email is not sent before then. */
  emailVerifiedAt?: string | null;
  createdAt?: string;
}

export interface Skill {
  id: string;
  category: SkillCategory;
  name: string;
  description?: string | null;
  /** Null for a category, set for a specialisation beneath one. */
  parentId?: string | null;
  kind?: 'category' | 'specialisation';
  sortOrder?: number;
  children?: Skill[];
}

export type SkillTaskStatus = 'pending' | 'approved' | 'rejected';

export interface SkillTask {
  id: string;
  workerId: string;
  skillId: string;
  reviewerId: string | null;
  evidenceUrl: string;
  notes?: string | null;
  status: SkillTaskStatus;
  reviewedAt: string | null;
  requiredApprovals?: number;
  disagreementFlag?: boolean;
  kind?: SkillTaskKind;
  claim?: { title: string; issuer: string; issuedOn?: string | null } | null;
  createdAt: string;
  skill?: Skill;
  worker?: User;
  reviewer?: User;
  evidence?: SkillTaskEvidence[];
  assignments?: {
    id: string;
    reviewerId: string;
    round: number;
    status: string;
    confidence?: number | null;
    decidedAt?: string | null;
    reviewer?: User;
  }[];
  appeal?: { id: string; reason: string; status: string } | null;
}

export type GigStatus = 'pending_review' | 'open' | 'matched' | 'completed' | 'cancelled' | 'rejected';

export interface Gig {
  id: string;
  clientId: string;
  skillId: string;
  title: string;
  description: string;
  budget: number;
  locationLat: number;
  locationLng: number;
  status: GigStatus;
  /** Optional bar set by the client. Soft: below it ranks lower, never hidden. */
  requiredLevel?: number | null;
  imageUrl?: string | null;
  createdAt: string;
  client?: User;
  skill?: Skill;
  matches?: Match[];
}

export type GigApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface GigApplication {
  id: string;
  gigId: string;
  workerId: string;
  status: GigApplicationStatus;
  rankScore?: number | null;
  scoreBreakdown?: MatchScoreBreakdown | null;
  createdAt: string;
  gig?: Gig;
  worker?: User;
}

export type MatchStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';

export type MatchOrigin = 'manual' | 'ranked';

export interface Match {
  id: string;
  gigId: string;
  workerId: string;
  status: MatchStatus;
  rankScore: number | null;
  origin?: MatchOrigin;
  respondedAt?: string | null;
  acceptedAt?: string | null;
  declineReason?: string | null;
  scoreBreakdown?: MatchScoreBreakdown | null;
  /** Only ever present for the client, and only while the job is in progress. */
  completionCode?: string | null;
  completionCodeAttempts?: number;
  workDoneAt?: string | null;
  completedVia?: 'code' | 'client' | 'auto' | null;
  createdAt: string;
  updatedAt: string;
  gig?: Gig;
  worker?: User;
  transaction?: Transaction;
  reviews?: Review[];
}

export type TransactionStatus = 'initiated' | 'confirmed' | 'failed';

export type EscrowStatus = 'none' | 'held' | 'released' | 'refunded';

export interface Transaction {
  id: string;
  matchId: string;
  amount: number;
  status: TransactionStatus;
  escrowStatus: EscrowStatus;
  heldAt?: string | null;
  releasedAt?: string | null;
  refundedAt?: string | null;
  currency?: string;
  provider: string;
  reference: string;
  createdAt: string;
  match?: Match;
}

export interface Review {
  id: string;
  matchId: string;
  authorId: string;
  recipientId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  author?: User;
}

export interface PublicProfile {
  id: string;
  name: string;
  role: Role;
  bio?: string | null;
  experienceSummary?: string | null;
  yearsExperience?: number | null;
  trustScore: number;
  trustScoreBreakdown?: TrustScoreBreakdown | null;
  reviewCount?: number;
  completedJobCount?: number;
  createdAt: string;
}

export type ReviewerTier = 'admin' | 'peer';

export type EvidenceKind = 'photo' | 'video' | 'voice' | 'link' | 'document';

/** How a competence claim was established, ascending in credibility. */
export type Provenance = 'self_declared' | 'document_sighted' | 'peer_reviewed' | 'work_earned';

export type SkillTaskKind = 'demonstration' | 'certificate';

export interface SkillTaskEvidence {
  id: string;
  taskId: string;
  kind: EvidenceKind;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationSec?: number | null;
  sha256?: string | null;
  capturedAt?: string | null;
}

export interface PassportSkillClaim {
  skill?: string;
  category?: string;
  proficiencyLevel: number;
  verifiedAt: string;
  /** How many separate reviewers approved it; reviewers are never named. */
  independentApprovals: number;
}

export interface PassportClaims {
  name: string;
  role: Role;
  memberSince: string;
  trustScore: number;
  trustScoreBreakdown?: TrustScoreBreakdown | null;
  reviewCount: number;
  completedJobs: number;
  skills: PassportSkillClaim[];
}

export interface PassportRead {
  valid: boolean;
  reason?: string;
  userId?: string;
  issuedAt?: string;
  claims?: PassportClaims;
}

export interface PassportVerification {
  valid: boolean;
  reason?: string;
  /** False means the record changed since issue, not that it was forged. */
  matches?: boolean;
  issuedAt?: string;
  checkedAt?: string;
  note?: string;
  current?: { skills: string[]; completedJobs: number; reviewCount: number };
}

export interface IncomeStatement {
  holder: { id: string; name: string; memberSince: string };
  period: { from: string | null; to: string | null };
  currency: string;
  summary: {
    jobsPaid: number;
    totalEarned: number;
    averagePerMonth: number;
    averagePerJob: number;
    monthsActive: number;
  };
  byMonth: { month: string; jobs: number; total: number }[];
  byCategory: { category: string; jobs: number; total: number }[];
  entries: {
    date: string;
    amount: number;
    currency: string;
    provider: string;
    reference: string;
    gig: string | null;
    category: string | null;
  }[];
  generatedAt: string;
  signature: string;
}

export type CollusionFlagType =
  | 'rubberStamped'
  | 'priorGigRelationship'
  | 'repeatedPairing'
  | 'approvesEverything'
  | 'rejectsEverything';

export interface CollusionFlag {
  type: CollusionFlagType;
  severity: 'high' | 'medium' | 'low';
  taskId?: string;
  workerId?: string;
  workerName?: string;
  reviewerId?: string;
  reviewerName?: string;
  /** The numbers behind the flag, so a claim can be judged rather than trusted. */
  evidence: Record<string, string | number>;
}

/** GET /admin/sms-health: reach and spend of SMS over the last seven days. */
export interface SmsHealth {
  since: string;
  driver: string;
  sender: string;
  usersOnSms: number;
  counts: { sent: number; delivered: number; failed: number; skipped: number };
  /** Accepted by the gateway over a day ago with no carrier report since. */
  noReportAfter24h: number;
  /** In the gateway's currency (USD for Pindo). */
  cost: number;
  averageSegments: number | null;
  /** Null until the first send since the server started. */
  balance: { amount: number; at: string } | null;
}

export interface CollusionReport {
  generatedAt: string;
  summary: {
    assignments: number;
    distinctReviewers: number;
    decided: number;
    flagged: number;
    byType: Record<string, number>;
  };
  reviewerLoad: {
    reviewerId: string;
    reviewerName?: string;
    assignments: number;
    share: number;
  }[];
  flags: CollusionFlag[];
}

export interface UserSkill {
  id: string;
  userId: string;
  skillId: string;
  proficiencyLevel: number;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  provenance?: Provenance;
  provenanceDetail?: Record<string, unknown> | null;
  credentialStrength?: number;
  selfDeclaredAt?: string | null;
  skill?: Skill;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}
