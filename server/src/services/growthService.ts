import { Op } from 'sequelize';
import { Gig, Payout, Skill, Transaction, User, UserSkill } from '../models';
import * as levelService from './levelService';
import * as rateService from './rateService';
import type { SkillCategory } from '../types/domain';

/**
 * The worker's Growth page: their level and what the next one takes, their
 * availability and monthly goal, the evidence ladder for each trade, and where
 * open work in their trades is right now.
 */
export const forWorker = async (userId: string) => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [level, monthPayouts, userSkills] = await Promise.all([
    levelService.forWorker(user),
    Payout.findAll({
      where: { userId, releasedAt: { [Op.gte]: monthStart } },
      attributes: ['amount'],
      include: [{ model: Transaction, as: 'transaction', attributes: [], required: true, where: { escrowStatus: 'released' } }],
    }),
    UserSkill.findAll({ where: { userId }, include: [{ model: Skill, as: 'skill' }], order: [['createdAt', 'ASC']] }),
  ]);

  const categories = [
    ...new Set(userSkills.map((us) => (us as UserSkill & { skill?: Skill }).skill?.category).filter(Boolean)),
  ] as SkillCategory[];
  const skillIds = categories.length
    ? (await Skill.findAll({ where: { category: categories }, attributes: ['id'] })).map((s) => s.id)
    : null;
  const open = (await Gig.findAll({
    where: { status: 'open', ...(skillIds ? { skillId: skillIds } : {}) },
    attributes: ['id', 'title', 'budget', 'locationLat', 'locationLng'],
    include: [{ model: Skill, as: 'skill', attributes: ['name', 'category'] }],
  })) as (Gig & { skill?: Skill })[];
  const rates = await Promise.all(categories.map((c) => rateService.forCategory(c)));

  return {
    level,
    availability: user.availability,
    availableFrom: user.availableFrom,
    goal: {
      monthlyGoal: user.monthlyGoal,
      earnedThisMonth: monthPayouts.reduce((sum, p) => sum + Number(p.amount), 0),
    },
    ladder: userSkills.map((us) => {
      const s = us as UserSkill & { skill?: Skill };
      return {
        skillId: us.skillId,
        skill: s.skill?.name ?? null,
        category: s.skill?.category ?? null,
        provenance: us.provenance,
        verificationStatus: us.verificationStatus,
        proficiencyLevel: us.proficiencyLevel,
        detail: us.provenanceDetail,
      };
    }),
    demand: {
      gigs: open.map((g) => ({
        id: g.id,
        title: g.title,
        budget: Number(g.budget),
        lat: g.locationLat,
        lng: g.locationLng,
        skill: g.skill?.name ?? null,
        category: g.skill?.category ?? null,
      })),
      rates,
    },
  };
};
