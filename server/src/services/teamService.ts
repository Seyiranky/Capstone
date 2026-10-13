import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, GigApplication, Match, MatchMember, Payout, Skill, User, UserSkill } from '../models';
import * as competenceService from './competenceService';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import type { CrewEntry, SkillCategory } from '../types/domain';

/**
 * Jobs done by more than one person: a crew the lead applied with, and an
 * apprentice the lead brings along.
 *
 * Shares are agreed up front and paid out per person when the job is released
 * (payoutService). An apprentice's reward is a share of the pay and, if the
 * lead endorses them, a `supervised` credential: evidence of real paid work,
 * deliberately kept below an independent review because the endorser is not
 * independent.
 */

type AppContext = Pick<Request, 'app'> | undefined;
type MatchWithGig = Match & { gig?: (Gig & { skill?: Skill | null }) | null };

export const MAX_CREW = 4;
export const LEAD_MIN_SHARE = 10;
export const MAX_APPRENTICE_SHARE = 30;

const loadMatch = async (matchId: string): Promise<MatchWithGig | null> =>
  (await Match.findByPk(matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: Skill, as: 'skill' }] }],
  })) as MatchWithGig | null;

/** Whether a user is verified in a trade (any skill in that category). */
export const isVerifiedIn = async (userId: string, category: SkillCategory): Promise<boolean> =>
  (await UserSkill.count({
    where: { userId, verificationStatus: 'verified' },
    include: [{ model: Skill, as: 'skill', required: true, where: { category } }],
  })) > 0;

const activeWorker = async (userId: string): Promise<User> => {
  const user = await User.findByPk(userId);
  if (!user || user.role !== 'worker' || user.status !== 'active') {
    throw new HttpError('Team members must be active workers', 400);
  }
  return user;
};

/**
 * Checks the crew a worker names when applying.
 *
 * Whole-number shares, at most MAX_CREW people, no duplicates or self, and the
 * lead keeps at least LEAD_MIN_SHARE: a "crew" where the lead takes nothing is
 * a lead lending their record to someone else.
 */
export const validateCrew = async (leadId: string, raw: unknown): Promise<CrewEntry[] | null> => {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return null;
  if (!Array.isArray(raw)) throw new HttpError('crew must be a list', 400);
  if (raw.length > MAX_CREW) throw new HttpError(`A crew can have at most ${MAX_CREW} members besides you`, 400);
  const crew: CrewEntry[] = raw.map((entry) => ({
    userId: String((entry as CrewEntry)?.userId ?? ''),
    sharePercent: Number((entry as CrewEntry)?.sharePercent),
  }));
  const ids = new Set<string>();
  for (const member of crew) {
    if (!Number.isInteger(member.sharePercent) || member.sharePercent < 1) {
      throw new HttpError('Each crew member needs a whole-number share of at least 1%', 400);
    }
    if (member.userId === leadId || ids.has(member.userId)) {
      throw new HttpError('Each crew member must be someone else, named once', 400);
    }
    ids.add(member.userId);
    await activeWorker(member.userId);
  }
  const total = crew.reduce((sum, m) => sum + m.sharePercent, 0);
  if (total > 100 - LEAD_MIN_SHARE) {
    throw new HttpError(`Crew shares can total at most ${100 - LEAD_MIN_SHARE}%; you keep the rest`, 400);
  }
  return crew;
};

/** Crew named on the approved application become invitations when the lead accepts. */
export const inviteCrew = async (ctx: AppContext, match: MatchWithGig): Promise<void> => {
  const application = await GigApplication.findOne({
    where: { gigId: match.gigId, workerId: match.workerId, status: 'approved' },
  });
  if (!application?.crew?.length) return;
  for (const member of application.crew) {
    const [row, created] = await MatchMember.findOrCreate({
      where: { matchId: match.id, userId: member.userId },
      defaults: { matchId: match.id, userId: member.userId, role: 'crew', sharePercent: member.sharePercent, joinedAt: null, endorsement: null, endorsementNote: null, endorsedAt: null },
    });
    if (created) {
      await notify(ctx, {
        userId: row.userId,
        title: 'Join a crew',
        body: `You were named on the crew for "${match.gig?.title}", for ${row.sharePercent}% of the pay. Join or decline.`,
        category: 'outcome',
      });
    }
  }
};

const committedShares = async (matchId: string): Promise<number> =>
  (await MatchMember.sum('sharePercent', {
    where: { matchId, status: { [Op.in]: ['invited', 'joined'] } },
  })) || 0;

/** The lead brings one apprentice onto a job in progress. */
export const inviteApprentice = async (
  ctx: AppContext,
  { matchId, leadId, apprenticeId, sharePercent }: { matchId: string; leadId: string; apprenticeId: string; sharePercent: number },
): Promise<MatchMember> => {
  const match = await loadMatch(matchId);
  if (!match || !match.gig) throw new HttpError('Match not found', 404);
  if (match.workerId !== leadId) throw new HttpError('Only the lead worker can bring an apprentice', 403);
  if (match.status !== 'accepted') throw new HttpError('An apprentice can join only a job in progress', 409);
  const category = match.gig.skill?.category;
  if (!category || !(await isVerifiedIn(leadId, category))) {
    throw new HttpError('Only a worker verified in this trade can take an apprentice', 403);
  }
  const share = Number(sharePercent);
  if (!Number.isInteger(share) || share < 0 || share > MAX_APPRENTICE_SHARE) {
    throw new HttpError(`An apprentice's share is a whole number from 0 to ${MAX_APPRENTICE_SHARE}%`, 400);
  }
  if (apprenticeId === leadId) throw new HttpError('You cannot be your own apprentice', 400);
  await activeWorker(apprenticeId);
  const existing = await MatchMember.findOne({
    where: { matchId, role: 'apprentice', status: { [Op.in]: ['invited', 'joined'] } },
  });
  if (existing) throw new HttpError('This job already has an apprentice', 409);
  if (await MatchMember.count({ where: { matchId, userId: apprenticeId } })) {
    throw new HttpError('That person is already on this job', 409);
  }
  if ((await committedShares(matchId)) + share > 100 - LEAD_MIN_SHARE) {
    throw new HttpError(`Shares on this job would leave you less than ${LEAD_MIN_SHARE}%`, 400);
  }

  const member = await MatchMember.create({
    matchId,
    userId: apprenticeId,
    role: 'apprentice',
    sharePercent: share,
    joinedAt: null,
    endorsement: null,
    endorsementNote: null,
    endorsedAt: null,
  });
  const lead = await User.findByPk(leadId, { attributes: ['name'] });
  await notify(ctx, {
    userId: apprenticeId,
    title: 'Apprentice invitation',
    body: `${lead?.name ?? 'A verified worker'} invited you to learn on "${match.gig.title}"${share ? `, for ${share}% of the pay` : ''}.`,
    category: 'outcome',
  });
  return member;
};

/** A crew member or apprentice joins or declines. */
export const respond = async (
  ctx: AppContext,
  { memberId, userId, accept }: { memberId: string; userId: string; accept: boolean },
): Promise<MatchMember> => {
  const member = await MatchMember.findByPk(memberId);
  if (!member || member.userId !== userId) throw new HttpError('Invitation not found', 404);
  if (member.status !== 'invited') throw new HttpError('You have already answered', 409);
  const match = await loadMatch(member.matchId);
  if (!match || match.status !== 'accepted') throw new HttpError('This job is no longer in progress', 409);
  await member.update(accept ? { status: 'joined', joinedAt: new Date() } : { status: 'declined' });
  const user = await User.findByPk(userId, { attributes: ['name'] });
  await notify(ctx, {
    userId: match.workerId,
    title: accept ? 'Team member joined' : 'Team member declined',
    body: `${user?.name ?? 'Someone'} ${accept ? 'joined' : 'declined'} "${match.gig?.title}".${accept ? '' : ' Their share stays with you.'}`,
    category: 'activity',
  });
  return member;
};

/** The skill a supervised credential is recorded against: the trade's top-level category. */
const categorySkill = async (category: SkillCategory) =>
  Skill.findOne({ where: { category, parentId: null } });

/**
 * The lead's verdict on their apprentice, once the job is paid.
 *
 * An endorsement records `supervised` provenance on the apprentice's skill in
 * that trade, creating the skill as unverified if they did not list it. It does
 * not verify the skill and never counts as a peer review.
 */
export const endorse = async (
  ctx: AppContext,
  { memberId, leadId, endorse: yes, note }: { memberId: string; leadId: string; endorse: boolean; note?: string },
): Promise<MatchMember> => {
  const member = await MatchMember.findByPk(memberId);
  if (!member || member.role !== 'apprentice') throw new HttpError('Apprentice not found', 404);
  const match = await loadMatch(member.matchId);
  if (!match || match.workerId !== leadId) throw new HttpError('Only the lead can endorse their apprentice', 403);
  if (member.status !== 'joined') throw new HttpError('Only an apprentice who joined can be endorsed', 409);
  if (member.endorsement) throw new HttpError('You have already given your verdict', 409);
  const paid = await Payout.count({ where: { matchId: match.id, userId: leadId } });
  if (match.status !== 'completed' || !paid) throw new HttpError('You can endorse once the job is paid', 409);

  await member.update({
    endorsement: yes ? 'endorsed' : 'notEndorsed',
    endorsementNote: typeof note === 'string' ? note.trim().slice(0, 280) || null : null,
    endorsedAt: new Date(),
  });

  const category = match.gig?.skill?.category;
  if (yes && category) {
    const skill = await categorySkill(category);
    if (skill) {
      await UserSkill.findOrCreate({
        where: { userId: member.userId, skillId: skill.id },
        defaults: {
          userId: member.userId,
          skillId: skill.id,
          proficiencyLevel: 1,
          provenanceDetail: null,
          selfDeclaredAt: null,
        },
      });
      await competenceService.recalculate(member.userId, skill.id, { trigger: 'apprentice:endorsed' });
    }
  }
  await notify(ctx, {
    userId: member.userId,
    title: yes ? 'You were endorsed' : 'Apprenticeship finished',
    body: yes
      ? `Your work on "${match.gig?.title}" was endorsed. It now shows as supervised experience on your profile.`
      : `Your apprenticeship on "${match.gig?.title}" is finished.`,
    category: 'outcome',
  });
  return member;
};
