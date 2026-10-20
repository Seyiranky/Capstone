import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import type { Request } from 'express';
import {
  Dispute,
  Gig,
  GigApplication,
  Match,
  MatchMember,
  Notification,
  SkillPassport,
  Transaction,
  User,
  sequelize,
} from '../models';
import { userWithPassword } from '../models/User';
import { AVATAR_DIR } from '../middleware/upload';
import { HttpError } from '../lib/httpError';
import notify from '../lib/notify';

/**
 * Deleting your own account (Rwanda Law No. 058/2021, NFR-7).
 *
 * The person disappears; the money does not. Their name, contact details,
 * profile, location, photo and sign-in are removed for good, and they vanish
 * from search, ranking and reviewing. Payments, payouts, receipts and reviews
 * stay, with "Deleted user" in place of the name: other people's receipts and
 * the platform's audit trail (NFR-8) depend on them, and a receipt anyone can
 * check must keep checking.
 *
 * It is refused while something between two people is unfinished, so nobody is
 * left with a job, a debt or a dispute against an account that no longer exists.
 */
type AppContext = Pick<Request, 'app'> | undefined;

export type DeletionBlocker =
  | { code: 'admin' }
  | { code: 'job_in_progress' | 'payment_owed' | 'payment_due' | 'dispute_open'; gigId: string; title: string };

const LIVE_DISPUTE = ['open', 'escalated'];

/** What stops this person deleting their account now, if anything. */
export const blockers = async (user: User): Promise<DeletionBlocker[]> => {
  if (user.role === 'admin') return [{ code: 'admin' }];

  // Every job the person is on: as the lead worker, a joined crew member or
  // apprentice, or as the client who posted it.
  const memberOf = await MatchMember.findAll({ where: { userId: user.id, status: 'joined' }, attributes: ['matchId'] });
  const matches = (await Match.findAll({
    where: {
      [Op.or]: [
        { workerId: user.id },
        { '$gig.clientId$': user.id },
        { id: memberOf.map((m) => m.matchId) },
      ],
      status: ['accepted', 'completed'],
    },
    include: [{ model: Gig, as: 'gig', attributes: ['id', 'title', 'clientId'] }],
  })) as (Match & { gig?: Gig | null })[];

  const found: DeletionBlocker[] = [];
  for (const m of matches) {
    const gig = { gigId: m.gigId, title: m.gig?.title ?? '' };
    if (await Dispute.count({ where: { matchId: m.id, status: LIVE_DISPUTE } })) {
      found.push({ code: 'dispute_open', ...gig });
    } else if (m.status === 'accepted') {
      found.push({ code: 'job_in_progress', ...gig });
    } else if (!(await Transaction.count({ where: { matchId: m.id, status: 'confirmed' } }))) {
      // Done and not paid: the client owes it, the worker is owed it.
      found.push({ code: m.gig?.clientId === user.id ? 'payment_owed' : 'payment_due', ...gig });
    }
  }
  return found;
};

const removeAvatarFile = (url: string | null) => {
  const name = url?.startsWith('/uploads/avatars/') ? path.basename(url) : null;
  if (name) fs.rm(path.join(AVATAR_DIR, name), { force: true }, () => undefined);
};

/**
 * Deletes the caller's account after checking their password.
 *
 * An account made with Google has no password of its own; its owner sets one
 * with "Forgot password" first. A stolen session alone must not be enough to
 * erase someone.
 */
export const deleteAccount = async (ctx: AppContext, userId: string, password: unknown): Promise<void> => {
  const user = await userWithPassword().findByPk(userId);
  if (!user || user.status === 'deleted') throw new HttpError('Account not found', 404);
  if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError('That password is not right', 403);
  }
  // The controller shows the person what is in the way; this is the guard.
  if ((await blockers(user)).length) {
    throw new HttpError('Finish or settle your open jobs before deleting your account', 409);
  }

  const avatar = user.avatarUrl ?? null;
  const notices: { userId: string; title: string; body: string }[] = [];

  await sequelize.transaction(async (t) => {
    // Unfinished business that has not started is closed, and whoever was
    // waiting on it is told. Nothing here was accepted, so no completion rate moves.
    const pendingMatches = (await Match.findAll({
      where: { status: 'pending', [Op.or]: [{ workerId: user.id }, { '$gig.clientId$': user.id }] },
      include: [{ model: Gig, as: 'gig', attributes: ['id', 'title', 'clientId'] }],
      transaction: t,
    })) as (Match & { gig?: Gig | null })[];
    for (const m of pendingMatches) {
      await m.update({ status: 'cancelled' }, { transaction: t });
      const other = m.workerId === user.id ? m.gig?.clientId : m.workerId;
      if (other) notices.push({ userId: other, title: 'Job no longer available', body: `"${m.gig?.title}" was closed: the other person left Isoko.` });
    }

    // As a worker: their waiting applications are withdrawn.
    await GigApplication.update(
      { status: 'withdrawn' },
      { where: { workerId: user.id, status: 'pending' }, transaction: t },
    );

    // As a client: gigs not yet under way are taken down, and their applicants told.
    const gigs = await Gig.findAll({
      where: { clientId: user.id, status: ['pending_review', 'open', 'matched'] },
      transaction: t,
    });
    for (const gig of gigs) {
      // A matched gig still under way would have blocked deletion above; here it is waiting only.
      await gig.update({ status: 'cancelled' }, { transaction: t });
      const waiting = await GigApplication.findAll({ where: { gigId: gig.id, status: 'pending' }, transaction: t });
      for (const a of waiting) {
        await a.update({ status: 'withdrawn' }, { transaction: t });
        notices.push({ userId: a.workerId, title: 'Gig withdrawn', body: `"${gig.title}" was withdrawn: the client left Isoko.` });
      }
    }

    // Their Skill Passports stop verifying.
    await SkillPassport.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null }, transaction: t });
    // Notices addressed to them say things about them; they go.
    await Notification.destroy({ where: { userId: user.id }, transaction: t });

    await User.update(
      {
        status: 'deleted',
        name: 'Deleted user',
        // Unique and unusable, so the address is free to sign up again.
        email: `deleted-${user.id}@deleted.invalid`,
        passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
        // Every open session ends now (see sessionStillValid).
        passwordChangedAt: new Date(),
        bio: null,
        avatarUrl: null,
        locationLat: null,
        locationLng: null,
        experienceSummary: null,
        yearsExperience: null,
        cvUrl: null,
        certificateUrl: null,
        phone: null,
        phoneVerifiedAt: null,
        phoneVerificationCodeHash: null,
        phoneVerificationExpiresAt: null,
        preferredChannel: 'none',
        emailVerifiedAt: null,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        trustedContactName: null,
        trustedContactPhone: null,
        availability: 'away',
        availableFrom: null,
        monthlyGoal: null,
        savingsPercent: 0,
        reviewerTier: null,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
      { where: { id: user.id }, transaction: t },
    );
  });

  removeAvatarFile(avatar);
  for (const notice of notices) await notify(ctx, notice);
};
