import { Op } from 'sequelize';
import type { Request } from 'express';
import { User, UserSkill } from '../models';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import * as skillVerificationService from './skillVerificationService';
import type { ReviewerTier } from '../types/domain';

/**
 * An admin's management of accounts: suspending and restoring, deleting, and
 * enrolling skill reviewers. Admin accounts and the admin's own account are
 * out of reach, and an account its owner deleted cannot be brought back.
 */
type AppContext = Pick<Request, 'app'> | undefined;

/** Every account, newest first, with the fields only an admin sees. */
export const listUsers = async () => {
  const users = await User.findAll({ order: [['createdAt', 'DESC']] });
  return users.map((u) => u.privateJSON());
};

export const listReviewers = async () => {
  const reviewers = await User.findAll({
    where: { reviewerTier: { [Op.not]: null } },
    order: [['name', 'ASC']],
  });
  return reviewers.map((u) => u.privateJSON());
};

const findUser = async (userId: string) => {
  const user = await User.findByPk(userId);
  if (!user) throw new HttpError('User not found', 404);
  return user;
};

/**
 * Enrols or removes a reviewer.
 *
 * Peer reviewers must themselves be verified and well rated: someone with no
 * verified skill has no standing to certify another worker's.
 */
export const setReviewerTier = async (ctx: AppContext, userId: string, reviewerTier: ReviewerTier | null) => {
  const user = await findUser(userId);
  if (reviewerTier === 'peer') {
    if (user.role !== 'worker') throw new HttpError('Only workers can be enrolled as peer reviewers', 400);
    const verifiedSkills = await UserSkill.count({
      where: { userId: user.id, verificationStatus: 'verified' },
    });
    if (verifiedSkills === 0) throw new HttpError('A peer reviewer must have at least one verified skill', 409);
    if (user.trustScore < skillVerificationService.PEER_MIN_TRUST_SCORE) {
      throw new HttpError(
        `A peer reviewer needs a trust score of at least ${skillVerificationService.PEER_MIN_TRUST_SCORE}`,
        409,
      );
    }
    if (user.reviewCount < skillVerificationService.PEER_MIN_REVIEWS) {
      throw new HttpError(
        `A peer reviewer needs at least ${skillVerificationService.PEER_MIN_REVIEWS} reviews, not a score resting on the prior`,
        409,
      );
    }
  }

  await user.update({ reviewerTier });

  if (reviewerTier) {
    await notify(ctx, {
      userId: user.id,
      title: 'You are now a skill reviewer',
      body: 'You can review skill submissions from other workers. Submissions are assigned to you automatically.',
    });
  }
  return user.privateJSON();
};

/** Suspends or reactivates an account, and tells its owner by every channel they use. */
export const moderate = async (ctx: AppContext, adminId: string, userId: string, action: 'suspend' | 'activate') => {
  const user = await findUser(userId);
  if (user.role === 'admin') throw new HttpError('Admins cannot be suspended', 403);
  if (user.id === adminId) throw new HttpError('You cannot moderate your own account', 403);
  // The person deleted it; their details are gone and it cannot be brought back.
  if (user.status === 'deleted') throw new HttpError('This account was deleted by its owner', 409);

  await user.update({ status: action === 'suspend' ? 'suspended' : 'active' });

  await notify(ctx, {
    userId: user.id,
    title: action === 'suspend' ? 'Account suspended' : 'Account reactivated',
    body:
      action === 'suspend'
        ? 'An administrator has suspended your account. Contact support if you believe this is a mistake.'
        : 'Your account has been reactivated. You can log in again.',
    // Losing or regaining access, which an in-app notice cannot reach someone
    // to tell them about once they are suspended.
    category: 'critical',
  });
  return user.privateJSON();
};

export const remove = async (adminId: string, userId: string) => {
  const user = await findUser(userId);
  if (user.role === 'admin') throw new HttpError('Admins cannot be deleted', 403);
  if (user.id === adminId) throw new HttpError('You cannot delete your own account', 403);
  await user.destroy();
};
