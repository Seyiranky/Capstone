import type { Request } from 'express';
import { Gig, Match, Skill, Transaction, User } from '../models';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import { inviteRankedCandidates } from './rankedInvitationService';

/**
 * An admin's review of gigs: approving or rejecting what clients post before
 * workers see it, and marking a gig sensitive.
 */
type AppContext = Pick<Request, 'app'> | undefined;

/** Every gig with its client, skill and matches, newest first. */
export const listAll = () =>
  Gig.findAll({
    include: [
      { model: User, as: 'client' },
      { model: Skill, as: 'skill' },
      {
        model: Match,
        as: 'matches',
        include: [
          { model: User, as: 'worker' },
          { model: Transaction, as: 'transaction' },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

/** An admin marks a live gig sensitive, or clears the mark, at any time. */
export const setSensitive = async (gigId: string, sensitive: unknown) => {
  const gig = await Gig.findByPk(gigId);
  if (!gig) throw new HttpError('Gig not found', 404);
  if (typeof sensitive !== 'boolean') throw new HttpError('sensitive must be true or false', 400);
  await gig.update({ sensitive, sensitiveBy: sensitive ? 'admin' : null });
  return gig;
};

/**
 * Approves or rejects a gig awaiting review and tells the client. An approved
 * gig opens and its top-ranked workers are invited; the admin can mark it
 * sensitive (or clear the mark) in the same step. A rejection carries the
 * admin's reason so the client can fix and repost.
 */
export const decide = async (
  ctx: AppContext,
  gigId: string,
  { decision, reason, sensitive }: { decision: 'approved' | 'rejected'; reason: string; sensitive?: unknown },
) => {
  const gig = await Gig.findByPk(gigId);
  if (!gig) throw new HttpError('Gig not found', 404);
  if (gig.status !== 'pending_review') throw new HttpError('This gig has already been reviewed', 409);

  const sensitiveChange =
    typeof sensitive === 'boolean' && sensitive !== gig.sensitive
      ? { sensitive, sensitiveBy: sensitive ? ('admin' as const) : null }
      : {};
  await gig.update(
    decision === 'approved' ? { status: 'open', openedAt: new Date(), ...sensitiveChange } : { status: 'rejected' },
  );

  await notify(ctx, {
    userId: gig.clientId,
    title: decision === 'approved' ? 'Gig approved' : 'Gig rejected',
    body:
      decision === 'approved'
        ? `Your gig "${gig.title}" was approved and is now live for workers to apply to.`
        : `Your gig "${gig.title}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    // A decision on work the client submitted and is waiting on.
    category: 'outcome',
  });

  const invitations = decision === 'approved' ? await inviteRankedCandidates(ctx, gig) : [];
  return { gig, invitations };
};
