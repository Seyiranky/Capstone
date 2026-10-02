import type { Request, Response } from 'express';
import {
  User,
  UserSkill,
  Skill,
  SkillTask,
  Gig,
  Match,
  Transaction,
  Review,
  Message,
} from '../models';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json(user);
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
  'phone',
  'preferredChannel',
] as const;

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

  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  await user.update(updates);
  res.json(user);
};

export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await User.findByPk(pathParam(req, 'id'));
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    bio: user.bio,
    experienceSummary: user.experienceSummary,
    yearsExperience: user.yearsExperience,
    trustScore: user.trustScore,
    // Exposed publicly on purpose: a score a client cannot interrogate is the
    // opaque-reputation problem this platform is meant to avoid.
    trustScoreBreakdown: user.trustScoreBreakdown,
    reviewCount: user.reviewCount,
    completedJobCount: user.completedJobCount,
    createdAt: user.createdAt,
  });
};

export const getUserSkills = async (req: Request, res: Response): Promise<void> => {
  const userSkills = await UserSkill.findAll({
    where: { userId: pathParam(req, 'id'), verificationStatus: 'verified' },
    include: [{ model: Skill, as: 'skill' }],
    order: [['createdAt', 'ASC']],
  });
  res.json(userSkills);
};

export const exportMyData = async (req: Request, res: Response): Promise<void> => {
  const userId = authed(req).id;

  const [
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  ] = await Promise.all([
    User.findByPk(userId),
    SkillTask.findAll({ where: { workerId: userId } }),
    SkillTask.findAll({ where: { reviewerId: userId } }),
    Gig.findAll({ where: { clientId: userId } }),
    Match.findAll({ where: { workerId: userId } }),
    Match.findAll({
      include: [{ model: Gig, as: 'gig', where: { clientId: userId }, required: true }],
    }),
    Review.findAll({ where: { authorId: userId } }),
    Review.findAll({ where: { recipientId: userId } }),
    Message.findAll({ where: { senderId: userId } }),
    Message.findAll({ where: { recipientId: userId } }),
  ]);

  const matchIds = [...matchesAsWorker, ...matchesAsClient].map((m) => m.id);
  const transactions = matchIds.length
    ? await Transaction.findAll({ where: { matchId: matchIds } })
    : [];

  res.setHeader('Content-Disposition', 'attachment; filename="isoko-talents-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    transactions,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  });
};
