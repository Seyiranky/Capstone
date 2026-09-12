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
  experienceSummary?: string | null;
  phone?: string | null;
  smsNotificationsEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
  createdAt?: string;
}

export interface Skill {
  id: string;
  category: SkillCategory;
  name: string;
  description?: string | null;
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
  createdAt: string;
  skill?: Skill;
  worker?: User;
  reviewer?: User;
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
  createdAt: string;
  updatedAt: string;
  gig?: Gig;
  worker?: User;
  transaction?: Transaction;
  reviews?: Review[];
}

export type TransactionStatus = 'initiated' | 'confirmed' | 'failed';

export interface Transaction {
  id: string;
  matchId: string;
  amount: number;
  status: TransactionStatus;
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
  trustScore: number;
  trustScoreBreakdown?: TrustScoreBreakdown | null;
  reviewCount?: number;
  completedJobCount?: number;
  createdAt: string;
}

export interface UserSkill {
  id: string;
  userId: string;
  skillId: string;
  proficiencyLevel: number;
  verificationStatus: 'unverified' | 'pending' | 'verified';
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
