import { Op } from 'sequelize';
import { Gig, Match, Skill, Transaction } from '../models';
import type { SkillCategory } from '../types/domain';

/**
 * What jobs in a skill category actually pay, so prices are set from evidence
 * rather than by undercutting.
 *
 * Open marketplaces reward the lowest bid. Here a client posting below what
 * comparable jobs paid is told so, and a worker quoting sees the usual range.
 * Paid amounts are preferred; with too few of them the guidance falls back to
 * what clients posted, and says which it is.
 */

export const MIN_SAMPLE = 3;

export type RateBasis = 'paid' | 'posted' | 'none';

export interface RateGuide {
  category: SkillCategory | null;
  basis: RateBasis;
  sampleSize: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

/** Linear-interpolated percentile of sorted values (0 ≤ q ≤ 1). */
export const percentile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export const summarise = (values: number[], basis: RateBasis, category: SkillCategory | null): RateGuide => {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n / 500) * 500;
  return {
    category,
    basis,
    sampleSize: sorted.length,
    p25: round(percentile(sorted, 0.25)),
    median: round(percentile(sorted, 0.5)),
    p75: round(percentile(sorted, 0.75)),
  };
};

const skillIdsIn = async (category: SkillCategory): Promise<string[]> =>
  (await Skill.findAll({ where: { category }, attributes: ['id'] })).map((s) => s.id);

export const forCategory = async (category: SkillCategory): Promise<RateGuide> => {
  const skillIds = await skillIdsIn(category);
  if (skillIds.length === 0) return { category, basis: 'none', sampleSize: 0, p25: null, median: null, p75: null };

  // A split dispute released half the price; it says nothing about the going rate.
  const paid = await Transaction.findAll({
    where: { status: 'confirmed', escrowStatus: 'released', releasedAmount: null },
    attributes: ['amount'],
    include: [
      {
        model: Match,
        as: 'match',
        attributes: [],
        required: true,
        include: [{ model: Gig, as: 'gig', attributes: [], required: true, where: { skillId: { [Op.in]: skillIds } } }],
      },
    ],
  });
  if (paid.length >= MIN_SAMPLE) return summarise(paid.map((t) => Number(t.amount)), 'paid', category);

  const posted = await Gig.findAll({
    where: { skillId: { [Op.in]: skillIds }, status: { [Op.notIn]: ['rejected', 'pending_review'] } },
    attributes: ['budget'],
  });
  if (posted.length >= MIN_SAMPLE) return summarise(posted.map((g) => Number(g.budget)), 'posted', category);

  return { category, basis: 'none', sampleSize: 0, p25: null, median: null, p75: null };
};

export const forSkill = async (skillId: string): Promise<RateGuide | null> => {
  const skill = await Skill.findByPk(skillId, { attributes: ['category'] });
  return skill ? forCategory(skill.category) : null;
};

/** The usual price range for every trade, for the market view. */
export const forAllTrades = async () => {
  const categories = await Skill.findAll({ where: { parentId: null }, attributes: ['name', 'category'] });
  return Promise.all(categories.map(async (c) => ({ name: c.name, ...(await forCategory(c.category)) })));
};
