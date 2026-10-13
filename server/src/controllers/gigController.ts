import type { Request, Response } from 'express';
import type { Includeable, WhereOptions } from 'sequelize';
import { Gig, User, Skill } from '../models';
import * as matchScoringService from '../services/matchScoringService';
import type { RankedPair } from '../types/scoring';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import * as rateService from '../services/rateService';

const GIG_INCLUDES: Includeable[] = [
  { model: User, as: 'client' },
  // parentId comes along for the ride: the scorer needs it to tell an exact
  // specialisation match from a sibling one.
  { model: Skill, as: 'skill' },
];

export const createGig = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { title, description, budget, skillId, requiredLevel, locationLat, locationLng } =
    req.body ?? {};
  if (
    !title ||
    !description ||
    budget === undefined ||
    !skillId ||
    locationLat === undefined ||
    locationLng === undefined
  ) {
    res.status(400).json({
      message: 'title, description, budget, skillId, locationLat, and locationLng are required',
    });
    return;
  }

  const skill = await Skill.findByPk(skillId);
  if (!skill) {
    res.status(404).json({ message: 'Skill not found' });
    return;
  }

  const level =
    requiredLevel === undefined || requiredLevel === null || requiredLevel === ''
      ? null
      : Number(requiredLevel);
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 5)) {
    res.status(400).json({ message: 'requiredLevel must be an integer from 1 to 5' });
    return;
  }

  const gig = await Gig.create({
    clientId: caller.id,
    title,
    description,
    budget: Number(budget),
    skillId,
    requiredLevel: level,
    locationLat: Number(locationLat),
    locationLng: Number(locationLng),
    status: 'pending_review',
    imageUrl: req.file ? `/uploads/gigs/${req.file.filename}` : null,
  });

  res.status(201).json(gig);
};

export const listGigs = async (req: Request, res: Response): Promise<void> => {
  const where: WhereOptions<Gig> & { status?: string; skillId?: string } = {};
  const status = stringParam(req, 'status');
  const skillId = stringParam(req, 'skillId');
  if (status) where.status = status;
  if (skillId) where.skillId = skillId;

  const gigs = await Gig.findAll({ where, include: GIG_INCLUDES, order: [['createdAt', 'DESC']] });
  res.json(gigs);
};

export const getGig = async (req: Request, res: Response): Promise<void> => {
  const gig = await Gig.findByPk(pathParam(req, 'id'), { include: GIG_INCLUDES });
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  res.json(gig);
};

/**
 * Removes provenance detail for the control arm.
 *
 * The ranking itself is untouched — both arms are matched identically — so the
 * comparison isolates what the client was told, not what the algorithm did.
 */
const stripProvenance = (candidates: RankedPair[]): RankedPair[] =>
  candidates.map((candidate) => ({
    ...candidate,
    provenance: null,
    reasons: candidate.reasons.filter(
      (reason) => !reason.key.startsWith('match.reason.provenance.'),
    ),
  }));

/**
 * Ranked candidate workers for a gig, each with the full score breakdown.
 *
 * The `profile` query parameter re-ranks with a different weighting, which is
 * how RQ2 compares proximity-first against trust-first weightings on identical
 * data.
 */
export const listCandidates = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const gig = await Gig.findByPk(pathParam(req, 'id'));
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  if (caller.role !== 'admin' && gig.clientId !== caller.id) {
    res.status(403).json({ message: 'Only the posting client or an admin may view candidates' });
    return;
  }

  const rawLimit = stringParam(req, 'limit');
  const limit = rawLimit ? Number(rawLimit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    res.status(400).json({ message: 'limit must be a positive integer' });
    return;
  }

  // Variance is computed over the full ranked set, before any limit, so it
  // describes the candidate pool rather than the page being shown.
  const ranked = await matchScoringService.rankCandidates({
    gig,
    profileName: stringParam(req, 'profile') ?? undefined,
  });

  // RQ3's manipulation is applied here rather than in the UI, so a client in
  // the plain arm is never sent provenance detail at all and the arm cannot be
  // defeated by reading the network tab.
  const viewer = await User.findByPk(caller.id, { attributes: ['experimentArm'] });
  const shown = viewer?.experimentArm === 'plain' ? stripProvenance(ranked) : ranked;

  res.json({
    gigId: gig.id,
    experimentArm: viewer?.experimentArm ?? null,
    componentVariance: matchScoringService.componentVariance(ranked),
    candidates: limit ? shown.slice(0, limit) : shown,
  });
};

const UPDATABLE_FIELDS = [
  'title',
  'description',
  'budget',
  'requiredLevel',
  'locationLat',
  'locationLng',
] as const;

export const updateGig = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const gig = await Gig.findByPk(pathParam(req, 'id'));
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  if (gig.clientId !== caller.id) {
    res.status(403).json({ message: 'Only the posting client may update this gig' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  await gig.update(updates);
  res.json(gig);
};

/** The usual price range for a skill's category, for pricing a gig or a quote. */
export const rates = async (req: Request, res: Response): Promise<void> => {
  const skillId = typeof req.query.skillId === 'string' ? req.query.skillId : '';
  if (!skillId) {
    res.status(400).json({ message: 'skillId is required' });
    return;
  }
  const guide = await rateService.forSkill(skillId);
  if (!guide) {
    res.status(404).json({ message: 'Skill not found' });
    return;
  }
  res.json(guide);
};
