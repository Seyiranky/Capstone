import { Op } from 'sequelize';
import { Gig, JobPhoto, Match, Review, Skill, Transaction } from '../models';

export interface WorkHistoryEntry {
  matchId: string;
  gig: string;
  skill: string | null;
  completedAt: Date;
  completedVia: string | null;
  rating: number | null;
  comment: string | null;
  photos: { url: string; sha256: string }[];
  receiptNumber: string | null;
}

type LoadedMatch = Match & {
  gig?: Gig & { skill?: Skill | null };
  transaction?: Transaction | null;
  reviews?: Review[];
  photos?: JobPhoto[];
};

/**
 * A worker's finished, paid jobs, newest first: what they did, how the client
 * rated it, and photos of the work.
 *
 * Only jobs the client actually paid for count, so the history cannot be padded
 * with matches that were completed on paper and never settled.
 */
export const forWorker = async (workerId: string, limit = 20): Promise<WorkHistoryEntry[]> => {
  const matches = (await Match.findAll({
    where: { workerId, status: 'completed' },
    include: [
      { model: Gig, as: 'gig', include: [{ model: Skill, as: 'skill', attributes: ['name'] }] },
      {
        model: Transaction,
        as: 'transaction',
        required: true,
        where: { status: 'confirmed', escrowStatus: { [Op.in]: ['released'] } },
      },
      { model: Review, as: 'reviews', where: { recipientId: workerId }, required: false },
      { model: JobPhoto, as: 'photos', required: false },
    ],
    order: [['updatedAt', 'DESC']],
    limit,
  })) as LoadedMatch[];

  return matches.map((m) => {
    const review = m.reviews?.[0];
    return {
      matchId: m.id,
      gig: m.gig?.title ?? 'Job',
      skill: m.gig?.skill?.name ?? null,
      completedAt: m.transaction?.releasedAt ?? m.updatedAt,
      completedVia: m.completedVia,
      rating: review?.rating ?? null,
      comment: review?.comment ?? null,
      photos: (m.photos ?? []).map((p) => ({ url: p.url, sha256: p.sha256 })),
      receiptNumber: m.transaction?.receiptNumber ?? null,
    };
  });
};

/** Paid jobs per skill, for the Skill Passport's "N paid jobs in this skill". */
export const paidJobsBySkill = async (workerId: string): Promise<Map<string, number>> => {
  const matches = (await Match.findAll({
    where: { workerId, status: 'completed' },
    attributes: ['id'],
    include: [
      { model: Gig, as: 'gig', attributes: ['skillId'] },
      {
        model: Transaction,
        as: 'transaction',
        attributes: [],
        required: true,
        where: { status: 'confirmed', escrowStatus: 'released' },
      },
    ],
  })) as LoadedMatch[];
  const counts = new Map<string, number>();
  for (const m of matches) {
    const skillId = m.gig?.skillId;
    if (skillId) counts.set(skillId, (counts.get(skillId) ?? 0) + 1);
  }
  return counts;
};
