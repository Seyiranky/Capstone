import { Op } from 'sequelize';
import { Gig, GigApplication, Match, Skill, User, UserSkill } from '../models';
import * as levelService from './levelService';
import * as matchScoringService from './matchScoringService';
import { HttpError } from '../lib/httpError';
import { locationName } from '../lib/locationName';
import type { ExperimentArm, Provenance, SkillCategory } from '../types/domain';

/**
 * The worker directory: clients looking for someone, rather than waiting for
 * applications to a posted gig.
 *
 * Only what a client needs to decide is returned: level, trust, paid jobs,
 * which contact details are confirmed (never the details), each skill with how
 * it was proven, and the area, named rather than plotted. For the research
 * control arm the proof levels are withheld, as they are on ranked lists.
 */
const PROVEN: Provenance[] = ['document_sighted', 'peer_reviewed', 'work_earned'];
const RANK: Record<Provenance, number> = { self_declared: 0, supervised: 1, document_sighted: 2, peer_reviewed: 3, work_earned: 4 };
const PAGE = 24;
const MAX_DIRECT_INVITES = 5;

export interface DirectoryFilters {
  q?: string;
  category?: string;
  area?: string;
  proven?: boolean;
  available?: boolean;
  sort?: 'trust' | 'jobs' | 'newest';
}

export const list = async (filters: DirectoryFilters, viewer: { id: string; arm: ExperimentArm | null }) => {
  const q = (filters.q ?? '').trim().replace(/[%_]/g, '').slice(0, 60);
  const workers = (await User.findAll({
    where: {
      role: 'worker',
      status: 'active',
      id: { [Op.ne]: viewer.id },
      ...(filters.available ? { availability: { [Op.ne]: 'away' } } : {}),
    },
    include: [{ model: UserSkill, as: 'userSkills', required: false, include: [{ model: Skill, as: 'skill' }] }],
  })) as (User & { userSkills?: (UserSkill & { skill?: Skill })[] })[];

  const plain = viewer.arm === 'plain';
  const matches = workers.filter((w) => {
    const skills = w.userSkills ?? [];
    if (filters.category && !skills.some((s) => s.skill?.category === filters.category)) return false;
    if (filters.proven && !skills.some((s) => PROVEN.includes(s.provenance as Provenance) && (!filters.category || s.skill?.category === filters.category))) {
      return false;
    }
    if (filters.area && locationName(w.locationLat, w.locationLng) !== filters.area) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = [w.name, w.experienceSummary ?? '', ...skills.map((s) => s.skill?.name ?? '')].join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sort = filters.sort ?? 'trust';
  matches.sort((a, b) =>
    sort === 'jobs'
      ? b.completedJobCount - a.completedJobCount
      : sort === 'newest'
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : // Unrated workers sort by their prior, not to the bottom: the score already accounts for few reviews.
          b.trustScore - a.trustScore,
  );

  const page = matches.slice(0, PAGE);
  const levels = await Promise.all(page.map((w) => levelService.forWorker(w)));
  return {
    total: matches.length,
    workers: page.map((w, i) => ({
      id: w.id,
      name: w.name,
      avatarUrl: w.avatarUrl ?? null,
      level: levels[i].level,
      trustScore: w.trustScore,
      reviewCount: w.reviewCount,
      completedJobCount: w.completedJobCount,
      availability: w.availability,
      availableFrom: w.availableFrom,
      area: locationName(w.locationLat, w.locationLng),
      summary: (w.experienceSummary || w.bio || '').slice(0, 160) || null,
      yearsExperience: w.yearsExperience,
      phoneVerified: Boolean(w.phoneVerifiedAt),
      emailVerified: Boolean(w.emailVerifiedAt),
      skills: (w.userSkills ?? [])
        .filter((s) => s.skill)
        .sort((x, y) => RANK[y.provenance as Provenance] - RANK[x.provenance as Provenance])
        .slice(0, 4)
        .map((s) => ({
          name: s.skill!.name,
          category: s.skill!.category as SkillCategory,
          provenance: plain ? null : s.provenance,
        })),
    })),
  };
};

/**
 * A client asks a worker directly to take one of their open gigs.
 *
 * It is an invitation, like a ranked one: the worker confirms they can take
 * it, and only then is the client asked to pay into escrow. The pair is scored
 * as any other, so the client sees the same explanation.
 */
export const invite = async (clientId: string, gigId: string, workerId: string) => {
  const gig = await Gig.findByPk(gigId);
  if (!gig || gig.clientId !== clientId) throw new HttpError('Gig not found', 404);
  if (gig.status !== 'open') throw new HttpError('Only a gig that is open, after admin approval, can be offered to a worker', 409);
  const worker = await User.findByPk(workerId);
  if (!worker || worker.role !== 'worker' || worker.status !== 'active') throw new HttpError('Worker not found', 404);
  if (worker.availability === 'away') throw new HttpError(`${worker.name} is away and not taking work right now`, 409);
  if (await Match.findOne({ where: { gigId, workerId, status: { [Op.in]: ['pending', 'accepted'] } } })) {
    throw new HttpError(`${worker.name} already has this gig`, 409);
  }
  if (await GigApplication.findOne({ where: { gigId, workerId, status: 'pending' } })) {
    throw new HttpError(`${worker.name} has already applied; their application is waiting for review`, 409);
  }
  if ((await Match.count({ where: { gigId, origin: 'direct', status: 'pending' } })) >= MAX_DIRECT_INVITES) {
    throw new HttpError(`A gig can have at most ${MAX_DIRECT_INVITES} invitations waiting at once`, 429);
  }
  const scored = await matchScoringService.scoreOne({ gig, worker });
  const match = await Match.create({
    gigId,
    workerId,
    status: 'pending',
    origin: 'direct',
    rankScore: scored.score,
    scoreBreakdown: scored,
    weightProfileId: scored.weightProfile.id,
  });
  return { match, gig, worker };
};
