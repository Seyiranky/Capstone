import type { Request } from 'express';
import { Match, User } from '../models';
import type { Gig } from '../models';
import notify from '../lib/notify';
import { canApply } from './applicationEligibility';
import * as matchScoringService from './matchScoringService';
import * as skillVerificationService from './skillVerificationService';
import type { InvitationReason } from '../types/domain';
import type { RankedPair } from '../types/scoring';

type AppContext = Pick<Request, 'app'> | undefined;

// Size of the ranked shortlist invited when a gig goes live. Set to 0 to run a
// pilot arm with manual applications only. Read per call so the arm can be
// switched without a restart.
const rankedInviteLimit = () => Number(process.env.RANKED_INVITE_LIMIT ?? 3);

// One slot of the shortlist is held for a worker without a track record.
// Set to 0 to run a control arm with pure ranking.
const explorationSlots = () => Number(process.env.EXPLORATION_SLOTS ?? 1);

/** A ranked candidate, tagged with why they made the shortlist. */
type Shortlisted = RankedPair & { invitationReason: InvitationReason };

/**
 * Picks the shortlist, reserving a slot for someone unproven.
 *
 * Ranking alone would invite the same established handful indefinitely:
 * credentials and trust both require completed work, and completed work
 * requires being invited. Over a short pilot most participants would never be
 * reached, so the data would come from a few people and everyone else would
 * experience nothing happening.
 *
 * The reserved slot is the *last* one — it never displaces a better-ranked
 * worker — and falls back to the next-ranked candidate when no newcomer is
 * eligible, so an invitation is never wasted.
 */
const buildShortlist = (eligible: RankedPair[], limit: number): Shortlisted[] => {
  const reserved = Math.min(explorationSlots(), Math.max(limit - 1, 0));
  if (reserved === 0) {
    return eligible
      .slice(0, limit)
      .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }));
  }

  const earned = eligible
    .slice(0, limit - reserved)
    .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }));
  const taken = new Set(earned.map((c) => c.workerId));

  const newcomers = eligible.filter(
    (c) =>
      !taken.has(c.workerId) &&
      (c.reviewCount ?? 0) < skillVerificationService.PEER_MIN_REVIEWS,
  );
  const explorers = newcomers
    .slice(0, reserved)
    .map((c) => ({ ...c, invitationReason: 'exploration' as InvitationReason }));

  // No unproven candidate to promote: give the slot back to the ranking.
  const shortfall = reserved - explorers.length;
  const filler = shortfall
    ? eligible
        .filter((c) => !taken.has(c.workerId) && !explorers.some((e) => e.workerId === c.workerId))
        .slice(0, shortfall)
        .map((c) => ({ ...c, invitationReason: 'ranked' as InvitationReason }))
    : [];

  return [...earned, ...explorers, ...filler];
};

/**
 * Invites the top-ranked eligible workers to a newly opened gig.
 *
 * These matches are born 'pending' with origin 'ranked', which is what gives
 * the pilot an acceptance rate to compare against the manual application arm
 * (RQ2). The full score breakdown is frozen onto each match so a ranking stays
 * reproducible after the weight profile is retuned.
 */
export const inviteRankedCandidates = async (ctx: AppContext, gig: Gig): Promise<Match[]> => {
  const limit = rankedInviteLimit();
  if (limit <= 0) return [];

  const candidates = await matchScoringService.rankCandidates({ gig });
  const fitting = candidates.filter(
    (candidate) => candidate.eligibleForInvite && candidate.workerId !== gig.clientId,
  );
  // An invitation is an offer to apply on the worker's behalf, so it follows
  // the same rules as applying: nobody is invited to a gig they could not apply to.
  const people = await User.findAll({ where: { id: fitting.map((c) => c.workerId) } });
  const byId = new Map(people.map((p) => [p.id, p]));
  const eligible = [];
  for (const candidate of fitting) {
    const worker = byId.get(candidate.workerId);
    if (worker && (await canApply(gig, worker)).eligible) eligible.push(candidate);
  }
  const shortlist = buildShortlist(eligible, limit);

  const invitations: Match[] = [];
  for (const candidate of shortlist) {
    const match = await Match.create({
      gigId: gig.id,
      workerId: candidate.workerId,
      status: 'pending',
      origin: 'ranked',
      invitationReason: candidate.invitationReason,
      rankScore: candidate.score,
      scoreBreakdown: candidate,
      weightProfileId: candidate.weightProfile.id,
    });
    await notify(ctx, {
      userId: candidate.workerId,
      title: 'You were matched to a new gig',
      body: `"${gig.title}" looks like a fit for you. Confirm if you can take it.`,
    });
    invitations.push(match);
  }

  return invitations;
};
