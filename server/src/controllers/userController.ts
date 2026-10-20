import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import {
  User,
  UserSkill,
  Skill,
} from '../models';
import * as accountDeletionService from '../services/accountDeletionService';
import { authed } from '../lib/authed';
import { AVATAR_DIR, looksLikeImage } from '../middleware/upload';
import { pathParam } from '../lib/query';
import * as workHistoryService from '../services/workHistoryService';
import * as levelService from '../services/levelService';
import * as dataExportService from '../services/dataExportService';
import * as sms from '../lib/channels/sms';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json(user.privateJSON());
};

const UPDATABLE_FIELDS = [
  'name',
  'bio',
  'locationLat',
  'locationLng',
  'preferredLanguage',
  'experienceSummary',
  'yearsExperience',
  'cvUrl',
  'certificateUrl',
  // Not 'phone': a number changes only through /auth/send-phone-code, which
  // clears its confirmation. Writable here, a confirmed number could be swapped
  // for an unconfirmed one and keep receiving SMS.
  'preferredChannel',
  'availability',
  'availableFrom',
  'monthlyGoal',
  'trustedContactName',
  'trustedContactPhone',
] as const;

const AVAILABILITY = ['available', 'busy', 'away'] as const;

const PREFERRED_CHANNELS = ['none', 'email', 'sms'] as const;

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  // An allowlist rather than a spread: role, trustScore and reviewerTier all
  // live on the same record, and a caller must not be able to set them by
  // naming them in the body.
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Checked here rather than left to the model validator, which would surface a
  // bad value as a 500. The allowlist below only decides *which* keys may be
  // written, not that what they carry is meaningful.
  if (
    body.preferredChannel !== undefined &&
    !PREFERRED_CHANNELS.includes(body.preferredChannel as (typeof PREFERRED_CHANNELS)[number])
  ) {
    res
      .status(400)
      .json({ message: `preferredChannel must be one of ${PREFERRED_CHANNELS.join(', ')}` });
    return;
  }

  // A name is shown to everyone the person works with: trimmed, a real length,
  // and made of the characters names are made of.
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(name)) {
      res.status(400).json({ message: 'Enter your name using letters, between 2 and 80 characters.' });
      return;
    }
    body.name = name;
  }

  // The server-side twin of the Settings screen's rule: SMS is chosen after the
  // number is confirmed, never before, or notices would be skipped silently.
  if (body.preferredChannel === 'sms' && !user.phoneVerifiedAt) {
    res.status(400).json({ message: 'Confirm your phone number before choosing SMS.' });
    return;
  }

  if (body.availability !== undefined && !AVAILABILITY.includes(body.availability as (typeof AVAILABILITY)[number])) {
    res.status(400).json({ message: `availability must be one of ${AVAILABILITY.join(', ')}` });
    return;
  }
  if (body.availableFrom != null && Number.isNaN(Date.parse(String(body.availableFrom)))) {
    res.status(400).json({ message: 'availableFrom must be a date' });
    return;
  }
  if (body.monthlyGoal != null && (!Number.isInteger(body.monthlyGoal) || (body.monthlyGoal as number) < 0)) {
    res.status(400).json({ message: 'monthlyGoal must be a whole number of RWF' });
    return;
  }
  // A trusted contact is texted on check-in and SOS, so the number must be one
  // an SMS can reach; stored in its normal form.
  if (body.trustedContactPhone != null && body.trustedContactPhone !== '') {
    const msisdn = sms.toRwandanMsisdn(String(body.trustedContactPhone));
    if (!msisdn) {
      res.status(400).json({ message: 'The trusted contact must be a Rwandan mobile number' });
      return;
    }
    body.trustedContactPhone = msisdn;
  } else if (body.trustedContactPhone === '') {
    body.trustedContactPhone = null;
  }

  // Coming back from away clears the return date.
  if (body.availability && body.availability !== 'away') body.availableFrom = null;

  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  await user.update(updates);
  res.json(user.privateJSON());
};

export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findByPk(pathParam(req, 'id'));
  if (!user || user.status === 'deleted') {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    bio: user.bio,
    avatarUrl: user.avatarUrl ?? null,
    experienceSummary: user.experienceSummary,
    yearsExperience: user.yearsExperience,
    trustScore: user.trustScore,
    // Exposed publicly on purpose: a score a client cannot interrogate is the
    // opaque-reputation problem this platform is meant to avoid.
    trustScoreBreakdown: user.trustScoreBreakdown,
    reviewCount: user.reviewCount,
    completedJobCount: user.completedJobCount,
    createdAt: user.createdAt,
    // Whether, not what: a client sees that the contact details were confirmed, never the details.
    phoneVerified: Boolean(user.phoneVerifiedAt),
    emailVerified: Boolean(user.emailVerifiedAt),
    availability: user.availability,
    availableFrom: user.availableFrom,
    level: user.role === 'worker' ? (await levelService.forWorker(user)).level : null,
  });
};

export const getUserSkills = async (req: Request, res: Response): Promise<void> => {
  const userSkills = await UserSkill.findAll({
    where: { userId: pathParam(req, 'id'), verificationStatus: 'verified' },
    include: [{ model: Skill, as: 'skill' }],
    order: [['createdAt', 'ASC']],
  });
  // The research control arm is not told how skills were proven (RQ3), here
  // as on ranked lists and in the worker directory.
  const viewer = await User.findByPk(authed(req).id, { attributes: ['experimentArm'] });
  res.json(
    viewer?.experimentArm === 'plain'
      ? userSkills.map((us) => ({ ...us.toJSON(), provenance: null, provenanceDetail: null }))
      : userSkills,
  );
};

export const exportMyData = async (req: Request, res: Response): Promise<void> => {
  const data = await dataExportService.collect(authed(req).id);
  res.setHeader('Content-Disposition', 'attachment; filename="isoko-my-data.json"');
  res.json(dataExportService.toJson(data));
};

/** The same records as a readable PDF report. */
export const exportMyDataPdf = async (req: Request, res: Response): Promise<void> => {
  const data = await dataExportService.collect(authed(req).id);
  if (!data.profile) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const pdf = dataExportService.toPdf(data);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="isoko-my-data.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
};

/** A worker's paid jobs, with ratings and photos of the work, for their profile. */
export const getWorkHistory = async (req: Request, res: Response): Promise<void> => {
  res.json(await workHistoryService.forWorker(pathParam(req, 'id')));
};

/**
 * Finds workers by name, for naming a crew or choosing an apprentice.
 *
 * Returns only what picking someone needs: name, trust and review count. Never
 * contact details, and never suspended accounts.
 */
export const searchWorkers = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const workers = await User.findAll({
    where: {
      role: 'worker',
      status: 'active',
      id: { [Op.ne]: caller.id },
      name: { [Op.iLike]: `%${q.replace(/[%_]/g, '')}%` },
    },
    attributes: ['id', 'name', 'trustScore', 'reviewCount'],
    order: [['name', 'ASC']],
    limit: 10,
  });
  res.json(workers);
};


const removeAvatarFile = (url: string | null) => {
  // Only ever a file in the avatars folder, named by the server.
  const name = url?.startsWith('/uploads/avatars/') ? path.basename(url) : null;
  if (name) fs.rm(path.join(AVATAR_DIR, name), { force: true }, () => undefined);
};

/** Sets the caller's profile picture: a square image cropped in the browser. */
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const file = req.file;
  if (!file) {
    res.status(400).json({ message: 'Choose a picture to upload' });
    return;
  }
  if (!looksLikeImage(file.path)) {
    fs.rm(file.path, { force: true }, () => undefined);
    res.status(400).json({ message: 'That file is not a picture' });
    return;
  }
  const user = await User.findByPk(caller.id);
  if (!user) {
    fs.rm(file.path, { force: true }, () => undefined);
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const previous = user.avatarUrl;
  await user.update({ avatarUrl: `/uploads/avatars/${file.filename}` });
  removeAvatarFile(previous);
  res.json(user.privateJSON());
};

/** Removes the caller's profile picture; their initials show again. */
/** What stands in the way of deleting the caller's account, so the screen can say so before asking. */
export const deletionCheck = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findByPk(authed(req).id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const blockers = await accountDeletionService.blockers(user);
  res.json({ canDelete: blockers.length === 0, blockers });
};

/** Deletes the caller's account (Law 058/2021): needs their password and nothing left unfinished. */
export const deleteMe = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (user) {
    const blockers = await accountDeletionService.blockers(user);
    if (blockers.length) {
      res.status(409).json({ message: 'Finish or settle your open jobs before deleting your account', blockers });
      return;
    }
  }
  await accountDeletionService.deleteAccount(req, caller.id, req.body?.password);
  res.status(204).end();
};

export const deleteAvatar = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const previous = user.avatarUrl;
  await user.update({ avatarUrl: null });
  removeAvatarFile(previous);
  res.json(user.privateJSON());
};
