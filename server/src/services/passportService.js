const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, UserSkill, Skill, SkillTask, SkillPassport, Match } = require('../models');

// Deliberately separate from JWT_SECRET: a passport is a long-lived public
// credential, so leaking it must not hand anyone a session token.
const signingSecret = () =>
  process.env.PASSPORT_SIGNING_SECRET || process.env.JWT_SECRET;

/**
 * The claims a passport asserts, rebuilt from current data.
 *
 * Reviewer identity is deliberately excluded. A client needs to know how many
 * independent people verified a skill, not who they were - naming them would
 * expose reviewers to exactly the pressure the rotation rules exist to prevent.
 */
const buildClaims = async (userId) => {
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
const contentHash = (claims) => {
  const canonical = JSON.stringify(claims, Object.keys(claims).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
};

const summarise = (claims) => ({
  skills: claims.skills.map((s) => `${s.skill}:${s.proficiencyLevel}`).sort(),
  completedJobs: claims.completedJobs,
  reviewCount: claims.reviewCount,
});

exports.issue = async (userId) => {
  const claims = await buildClaims(userId);
  if (!claims) return null;

  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, jti: tokenId, hash: contentHash(summarise(claims)) },
    signingSecret(),
    { expiresIn: '365d' },
  );

  await SkillPassport.create({ userId, tokenId, issuedAt: new Date() });
  return { token, tokenId, claims };
};

/** Revokes every passport a user has issued, e.g. before issuing a fresh one. */
exports.revokeAllFor = async (userId) => {
  await SkillPassport.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null } },
  );
};

const decode = (token) => {
  try {
    return jwt.verify(token, signingSecret());
  } catch {
    return null;
  }
};

/** Resolves a passport to its live claims, or an explanation of why it failed. */
exports.read = async (token) => {
  const payload = decode(token);
  if (!payload) return { valid: false, reason: 'invalidSignature' };

  const record = await SkillPassport.findOne({ where: { tokenId: payload.jti } });
  if (!record) return { valid: false, reason: 'unknownPassport' };
  if (record.revokedAt) return { valid: false, reason: 'revoked', revokedAt: record.revokedAt };

  const claims = await buildClaims(payload.sub);
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
exports.verify = async (token) => {
  const payload = decode(token);
  if (!payload) return { valid: false, reason: 'invalidSignature' };

  const read = await exports.read(token);
  if (!read.valid) return read;

  const current = summarise(read.claims);
  const matches = contentHash(current) === payload.hash;

  return {
    valid: true,
    matches,
    issuedAt: read.issuedAt,
    checkedAt: new Date().toISOString(),
    current,
    note: matches
      ? 'The record matches this passport exactly.'
      : 'This holder\'s verified record has changed since the passport was issued. Check the current details below.',
  };
};

exports.buildClaims = buildClaims;
