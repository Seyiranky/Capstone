import fs from 'fs';
import type { Request, Response } from 'express';
import type { Includeable, WhereOptions } from 'sequelize';
import { Gig, User, Skill } from '../models';
import * as matchScoringService from '../services/matchScoringService';
import type { RankedPair } from '../types/scoring';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import * as rateService from '../services/rateService';
import { bareMime, checkVoiceNote, fieldFile } from '../middleware/upload';
import { looksSensitive } from '../lib/sensitiveGig';

const GIG_INCLUDES: Includeable[] = [
  { model: User, as: 'client' },
  // parentId comes along for the ride: the scorer needs it to tell an exact
  // specialisation match from a sibling one.
  { model: Skill, as: 'skill' },
];

// Limits on what a gig may say and cost. The budget bounds match the quote
// bounds on applications.
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;
const BUDGET_MIN = 500;
const BUDGET_MAX = 50_000_000;

/**
 * Checks the fields a client can set on a gig. With `partial`, absent fields
 * are skipped (an edit); otherwise title, description, budget and location are
 * required (a new gig). Returns the cleaned values, or the first problem.
 */
const checkGigFields = (
  body: Record<string, unknown>,
  partial: boolean,
): { error: string } | { values: Record<string, unknown> } => {
  const values: Record<string, unknown> = {};
  const has = (k: string) => body[k] !== undefined && body[k] !== null && body[k] !== '';
  for (const k of ['title', 'description']) {
    if (!has(k)) {
      if (!partial) return { error: 'title, description, budget, skillId, locationLat, and locationLng are required' };
      continue;
    }
    const text = String(body[k]).trim();
    const max = k === 'title' ? TITLE_MAX : DESCRIPTION_MAX;
    if (!text) return { error: `${k} cannot be empty` };
    if (text.length > max) return { error: `${k} must be at most ${max} characters` };
    values[k] = text;
  }
  if (has('budget')) {
    const budget = Number(body.budget);
    if (!Number.isFinite(budget) || budget < BUDGET_MIN || budget > BUDGET_MAX) {
      return { error: `budget must be between ${BUDGET_MIN} and ${BUDGET_MAX.toLocaleString()} RWF` };
    }
    values.budget = Math.round(budget);
  } else if (!partial) {
    return { error: 'title, description, budget, skillId, locationLat, and locationLng are required' };
  }
  for (const [k, limit] of [
    ['locationLat', 90],
    ['locationLng', 180],
  ] as const) {
    if (!has(k)) {
      if (!partial) return { error: 'title, description, budget, skillId, locationLat, and locationLng are required' };
      continue;
    }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || Math.abs(v) > limit) return { error: `${k} is not a valid coordinate` };
    values[k] = v;
  }
  if (body.requiredLevel !== undefined) {
    const raw = body.requiredLevel;
    const level = raw === null || raw === '' ? null : Number(raw);
    if (level !== null && (!Number.isInteger(level) || level < 1 || level > 5)) {
      return { error: 'requiredLevel must be an integer from 1 to 5' };
    }
    values.requiredLevel = level;
  }
  return { values };
};

/** The client's tick, or Isoko's reading of the words; whichever says sensitive wins. */
const sensitivity = (asked: unknown, title: string, description: string) => {
  const byClient = asked === true || asked === 'true';
  if (byClient) return { sensitive: true, sensitiveBy: 'client' as const };
  if (looksSensitive(title, description)) return { sensitive: true, sensitiveBy: 'keywords' as const };
  return { sensitive: false, sensitiveBy: null };
};

export const createGig = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const skillId = req.body?.skillId;
  const image = fieldFile(req, 'image');
  const voice = fieldFile(req, 'voice');
  const discard = () => [image, voice].forEach((f) => f && fs.rmSync(f.path, { force: true }));

  const checked = checkGigFields((req.body ?? {}) as Record<string, unknown>, false);
  if ('error' in checked || !skillId) {
    discard();
    res.status(400).json({
      message: 'error' in checked ? checked.error : 'title, description, budget, skillId, locationLat, and locationLng are required',
    });
    return;
  }

  const skill = await Skill.findByPk(skillId);
  if (!skill) {
    discard();
    res.status(404).json({ message: 'Skill not found' });
    return;
  }

  const voiceCheck = voice ? checkVoiceNote(voice, req.body?.voiceDurationSec) : null;
  if (voiceCheck && 'error' in voiceCheck) {
    discard();
    res.status(400).json({ message: voiceCheck.error });
    return;
  }

  const { values } = checked;
  const gig = await Gig.create({
    clientId: caller.id,
    title: values.title as string,
    description: values.description as string,
    budget: values.budget as number,
    skillId,
    requiredLevel: (values.requiredLevel as number | null | undefined) ?? null,
    locationLat: values.locationLat as number,
    locationLng: values.locationLng as number,
    status: 'pending_review',
    imageUrl: image ? `/uploads/gigs/${image.filename}` : null,
    voiceNoteUrl: voice ? `/uploads/gigs/${voice.filename}` : null,
    voiceNoteMimeType: voice ? bareMime(voice.mimetype) : null,
    voiceNoteDurationSec: voiceCheck && 'durationSec' in voiceCheck ? voiceCheck.durationSec : null,
    ...sensitivity(req.body?.sensitive, values.title as string, values.description as string),
  });

  res.status(201).json(gig);
};

/** Gigs an admin has not approved, or has turned down, are seen only by their client and admins. */
const UNPUBLISHED: Gig['status'][] = ['pending_review', 'rejected'];

const canSee = (gig: Gig, caller?: { id: string; role: string }) =>
  !UNPUBLISHED.includes(gig.status) || caller?.role === 'admin' || gig.clientId === caller?.id;

export const listGigs = async (req: Request, res: Response): Promise<void> => {
  const caller = req.user;
  const where: WhereOptions<Gig> & { status?: string; skillId?: string } = {};
  const status = stringParam(req, 'status');
  const skillId = stringParam(req, 'skillId');
  if (status) where.status = status;
  if (skillId) where.skillId = skillId;

  const gigs = await Gig.findAll({ where, include: GIG_INCLUDES, order: [['createdAt', 'DESC']] });
  res.json(gigs.filter((gig) => canSee(gig, caller)));
};

export const getGig = async (req: Request, res: Response): Promise<void> => {
  const gig = await Gig.findByPk(pathParam(req, 'id'), { include: GIG_INCLUDES });
  if (!gig || !canSee(gig, req.user)) {
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

  // Once a worker is matched the terms are what they agreed to, and escrow
  // holds that budget; a finished or cancelled gig is a record.
  if (gig.status !== 'pending_review' && gig.status !== 'open') {
    res.status(409).json({ message: 'A gig can only be edited before a worker is matched' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowed = Object.fromEntries(UPDATABLE_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
  const checked = checkGigFields(allowed, true);
  if ('error' in checked) {
    res.status(400).json({ message: checked.error });
    return;
  }

  // Approved wording that changes goes back to an admin, so what workers see
  // is always something a person has checked.
  const reworded = ['title', 'description'].some(
    (k) => k in checked.values && checked.values[k] !== gig.get(k as 'title' | 'description'),
  );
  // A client can mark a gig sensitive, never unmark one an admin marked; new
  // wording that reads as sensitive marks it too.
  const title = (checked.values.title as string | undefined) ?? gig.title;
  const description = (checked.values.description as string | undefined) ?? gig.description;
  const next = sensitivity(body.sensitive, title, description);
  const sensitiveChange =
    next.sensitive && !gig.sensitive
      ? next
      : body.sensitive === false && gig.sensitive && gig.sensitiveBy === 'client' && !looksSensitive(title, description)
        ? { sensitive: false, sensitiveBy: null }
        : {};
  await gig.update({
    ...checked.values,
    ...sensitiveChange,
    ...(reworded && gig.status === 'open' ? { status: 'pending_review' } : {}),
  });
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
