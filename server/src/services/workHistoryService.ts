import { Gig, JobPhoto, Match, Payout, Review, Skill, Transaction } from '../models';
import type { PayoutRole } from '../types/domain';

export interface WorkHistoryEntry {
  matchId: string;
  gig: string;
  skill: string | null;
  /** Their part on the job: the lead, a crew member or an apprentice. */
  role: PayoutRole;
  completedAt: Date;
  completedVia: string | null;
  rating: number | null;
  comment: string | null;
  photos: { url: string; sha256: string }[];
  receiptNumber: string | null;
}

type LoadedPayout = Payout & {
  match?: Match & {
    gig?: Gig & { skill?: Skill | null };
    reviews?: Review[];
    photos?: JobPhoto[];
  };
};

/** Paid work only: a payout whose transaction is settled and released. */
const releasedTransaction = {
  model: Transaction,
  as: 'transaction',
  required: true,
  attributes: [],
  where: { status: 'confirmed', escrowStatus: 'released' },
};

/**
 * A worker's paid jobs, newest first: what they did, how the client rated the
 * job, and photos of the work.
 *
 * Read from payouts, so a crew member or apprentice has the job in their
 * history too, marked with the part they played. Only jobs actually paid count,
 * so the history cannot be padded with matches completed on paper.
 */
export const forWorker = async (workerId: string, limit = 20): Promise<WorkHistoryEntry[]> => {
  const payouts = (await Payout.findAll({
    where: { userId: workerId },
    include: [
      releasedTransaction,
      {
        model: Match,
        as: 'match',
        required: true,
        include: [
          { model: Gig, as: 'gig', include: [{ model: Skill, as: 'skill', attributes: ['name'] }] },
          { model: Review, as: 'reviews', required: false },
          { model: JobPhoto, as: 'photos', required: false },
        ],
      },
    ],
    order: [['releasedAt', 'DESC']],
    limit,
  })) as LoadedPayout[];

  return payouts.map((p) => {
    const m = p.match;
    // The client's review of the job, which is a review of the lead's work.
    const review = m?.reviews?.find((r) => r.recipientId === m.workerId);
    return {
      matchId: p.matchId,
      gig: m?.gig?.title ?? 'Job',
      skill: m?.gig?.skill?.name ?? null,
      role: p.role,
      completedAt: p.releasedAt,
      completedVia: m?.completedVia ?? null,
      rating: review?.rating ?? null,
      comment: review?.comment ?? null,
      photos: (m?.photos ?? []).map((ph) => ({ url: ph.url, sha256: ph.sha256 })),
      receiptNumber: p.receiptNumber,
    };
  });
};

/** Paid jobs per skill, for the Skill Passport's "N paid jobs in this skill". */
export const paidJobsBySkill = async (workerId: string): Promise<Map<string, number>> => {
  const payouts = (await Payout.findAll({
    where: { userId: workerId },
    attributes: ['id'],
    include: [
      releasedTransaction,
      { model: Match, as: 'match', attributes: ['id'], required: true, include: [{ model: Gig, as: 'gig', attributes: ['skillId'] }] },
    ],
  })) as LoadedPayout[];
  const counts = new Map<string, number>();
  for (const p of payouts) {
    const skillId = p.match?.gig?.skillId;
    if (skillId) counts.set(skillId, (counts.get(skillId) ?? 0) + 1);
  }
  return counts;
};
