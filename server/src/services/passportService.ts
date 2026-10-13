import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User, UserSkill, Skill, SkillTask, SkillPassport, Match } from '../models';
import { passportSigningSecret } from '../config/env';
import type { Role } from '../types/domain';
import type { TrustBreakdown } from '../types/scoring';
import * as workHistoryService from './workHistoryService';

export interface PassportSkillClaim {
  skill: string | undefined;
  category: string | undefined;
  proficiencyLevel: number;
  verifiedAt: Date;
  /** How many independent people approved it — never who they were. */
  independentApprovals: number;
  /** Jobs in this skill the holder was paid for through escrow. */
  paidJobs: number;
}

export interface PassportClaims {
  name: string;
  role: Role;
  memberSince: Date;
  trustScore: number;
  trustScoreBreakdown: TrustBreakdown | null;
  reviewCount: number;
  completedJobs: number;
  skills: PassportSkillClaim[];
}

/** The reduced form that is hashed into the token. */
interface ClaimsSummary {
  skills: string[];
  completedJobs: number;
  reviewCount: number;
}

interface PassportPayload extends jwt.JwtPayload {
  sub: string;
  jti: string;
  hash: string;
}

export type PassportRead =
  | { valid: false; reason: 'invalidSignature' | 'unknownPassport' | 'unknownHolder' }
  | { valid: false; reason: 'revoked'; revokedAt: Date }
  | { valid: true; userId: string; issuedAt: Date; claims: PassportClaims };

export type PassportVerification =
  | Extract<PassportRead, { valid: false }>
  | {
      valid: true;
      matches: boolean;
      issuedAt: Date;
      checkedAt: string;
      current: ClaimsSummary;
      note: string;
    };

/**
 * The claims a passport asserts, rebuilt from current data.
 *
 * Reviewer identity is deliberately excluded. A client needs to know how many
 * independent people verified a skill, not who they were - naming them would
 * expose reviewers to exactly the pressure the rotation rules exist to prevent.
 */
const buildClaimsFor = async (userId: string): Promise<PassportClaims | null> => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const [userSkills, completedJobs] = await Promise.all([
    UserSkill.findAll({
      where: { userId, verificationStatus: 'verified' },
      include: [{ model: Skill, as: 'skill' }],
      order: [['createdAt', 'ASC']],
    }),
    Match.count({ where: { workerId: userId, status: 'completed' } }),
  ]);

  const paidJobs = await workHistoryService.paidJobsBySkill(userId);
  const skills = await Promise.all(
    userSkills.map(async (us) => {
      const approvals = await SkillTask.count({
        where: { workerId: userId, skillId: us.skillId, status: 'approved' },
      });
      return {
        skill: us.skill?.name,
        category: us.skill?.category,
        proficiencyLevel: us.proficiencyLevel,
        verifiedAt: us.updatedAt,
        independentApprovals: approvals,
        // Paid work in this skill: evidence from the market, alongside the
        // peers' judgement. Not part of the signed summary, so passports
        // issued before it existed still verify.
        paidJobs: paidJobs.get(us.skillId) ?? 0,
      };
    }),
  );

  return {
    name: user.name,
    role: user.role,
    memberSince: user.createdAt,
    trustScore: user.trustScore,
    trustScoreBreakdown: user.trustScoreBreakdown,
    reviewCount: user.reviewCount,
    completedJobs,
    skills,
  };
};

/**
 * Stable fingerprint of the claims.
 *
 * Keys are sorted so an unchanged record always hashes identically, which is
 * what lets verification detect that the underlying data moved after issue.
 */
const contentHash = (claims: ClaimsSummary): string => {
  const canonical = JSON.stringify(claims, Object.keys(claims).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

const summarise = (claims: PassportClaims): ClaimsSummary => ({
  skills: claims.skills.map((s) => `${s.skill}:${s.proficiencyLevel}`).sort(),
  completedJobs: claims.completedJobs,
  reviewCount: claims.reviewCount,
});

export const issue = async (
  userId: string,
): Promise<{ token: string; tokenId: string; claims: PassportClaims } | null> => {
  const claims = await buildClaimsFor(userId);
  if (!claims) return null;

  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, jti: tokenId, hash: contentHash(summarise(claims)) },
    passportSigningSecret(),
    { expiresIn: '365d' },
  );

  await SkillPassport.create({ userId, tokenId, issuedAt: new Date() });
  return { token, tokenId, claims };
};

/** Revokes every passport a user has issued, e.g. before issuing a fresh one. */
export const revokeAllFor = async (userId: string): Promise<void> => {
  await SkillPassport.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
};

const decode = (token: string): PassportPayload | null => {
  try {
    return jwt.verify(token, passportSigningSecret()) as PassportPayload;
  } catch {
    return null;
  }
};

/** Resolves a passport to its live claims, or an explanation of why it failed. */
export const read = async (token: string): Promise<PassportRead> => {
  const payload = decode(token);
  if (!payload) return { valid: false, reason: 'invalidSignature' };

  const record = await SkillPassport.findOne({ where: { tokenId: payload.jti } });
  if (!record) return { valid: false, reason: 'unknownPassport' };
  if (record.revokedAt) return { valid: false, reason: 'revoked', revokedAt: record.revokedAt };

  const claims = await buildClaimsFor(payload.sub);
  if (!claims) return { valid: false, reason: 'unknownHolder' };

  return { valid: true, userId: payload.sub, issuedAt: record.issuedAt, claims };
};

/**
 * Checks the passport against live data.
 *
 * `matches: false` is not a forgery, it means the record has changed since the
 * passport was issued - a newly verified skill, or one revoked. Saying which is
 * more useful to a client than a bare pass/fail.
 */
export const verify = async (token: string): Promise<PassportVerification> => {
  const payload = decode(token);
  if (!payload) return { valid: false, reason: 'invalidSignature' };

  const result = await read(token);
  if (!result.valid) return result;

  const current = summarise(result.claims);
  const matches = contentHash(current) === payload.hash;

  return {
    valid: true,
    matches,
    issuedAt: result.issuedAt,
    checkedAt: new Date().toISOString(),
    current,
    note: matches
      ? 'The record matches this passport exactly.'
      : "This holder's verified record has changed since the passport was issued. Check the current details below.",
  };
};

export { buildClaimsFor as buildClaims };
