import { CoverClaim, Gig, Match, MatchMember, Skill, Transaction, User } from '../models';
import { HttpError } from '../lib/httpError';
import { CLAIM_WINDOW_DAYS, COVER_LIMIT, isOnSite, policyNumber, premiumFor } from '../lib/jobCover';

const DAY_MS = 24 * 60 * 60 * 1000;
const DESCRIPTION_MAX = 2000;

type MatchWithGig = Match & { gig?: Gig & { skill?: Skill | null } };

/** A job whose money already arrived (paid in advance under escrow) has no later payment to bill a premium to. */
const alreadyPaid = (matchId: string) => Transaction.count({ where: { matchId, status: 'confirmed' } }).then(Boolean);

const loadMatch = async (matchId: string) => {
  const match = (await Match.findByPk(matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: Skill, as: 'skill' }] }],
  })) as MatchWithGig | null;
  if (!match) throw new HttpError('Job not found', 404);
  return match;
};

/** The lead worker and every crew member who joined are covered. */
const coveredPeople = async (match: Match) => {
  const crew = await MatchMember.findAll({ where: { matchId: match.id, status: 'joined' }, attributes: ['userId'] });
  return new Set([match.workerId, ...crew.map((m) => m.userId)]);
};

/**
 * The client adds cover while the job is under way, for on-site trades only.
 * Cover starts at once; the premium is billed in the client's Mobile Money
 * payment when the job is done.
 */
export const buy = async (matchId: string, clientId: string) => {
  const match = await loadMatch(matchId);
  if (match.gig?.clientId !== clientId) throw new HttpError('Only the client can add Job Cover', 403);
  if (!isOnSite(match.gig?.skill?.category)) throw new HttpError('Job Cover is for work done on site', 400);
  if (match.status !== 'accepted') throw new HttpError('Cover can be added while the job is in progress', 409);
  if (match.coverPolicyNumber) return match;
  if (await alreadyPaid(match.id)) {
    throw new HttpError('This job was paid in advance, so there is no payment to add Job Cover to', 409);
  }
  const price = Number(match.agreedAmount ?? match.gig?.budget ?? 0);
  return match.update({ coverPremium: premiumFor(price), coverPolicyNumber: policyNumber(), coverStartedAt: new Date() });
};

/** What a party to the job sees: whether it can be or is covered, and the claims on it. */
export const status = async (matchId: string, viewer: { id: string; role: string }) => {
  const match = await loadMatch(matchId);
  const people = await coveredPeople(match);
  const isClient = match.gig?.clientId === viewer.id;
  if (!people.has(viewer.id) && !isClient && viewer.role !== 'admin') {
    throw new HttpError('Only people on this job can see its cover', 403);
  }
  const claims = await CoverClaim.findAll({
    where: { matchId, ...(viewer.role === 'admin' || isClient ? {} : { userId: viewer.id }) },
    order: [['createdAt', 'DESC']],
  });
  const price = Number(match.agreedAmount ?? match.gig?.budget ?? 0);
  const eligible = isOnSite(match.gig?.skill?.category);
  return {
    eligible,
    covered: Boolean(match.coverPolicyNumber),
    canBuy: eligible && isClient && match.status === 'accepted' && !match.coverPolicyNumber && !(await alreadyPaid(match.id)),
    policyNumber: match.coverPolicyNumber ?? null,
    premium: match.coverPremium != null ? Number(match.coverPremium) : premiumFor(price),
    limit: COVER_LIMIT,
    claimWindowDays: CLAIM_WINDOW_DAYS,
    canClaim:
      Boolean(match.coverPolicyNumber) &&
      people.has(viewer.id) &&
      claimWindowOpen(match) &&
      !claims.some((c) => c.userId === viewer.id && c.status === 'submitted'),
    claims,
  };
};

/** Open while the job is under way and for CLAIM_WINDOW_DAYS after it was done. */
const claimWindowOpen = (match: Match) => {
  if (!match.coverPolicyNumber) return false;
  if (match.status === 'accepted') return true;
  if (match.status === 'completed' && match.completedAt) {
    return Date.now() - match.completedAt.getTime() <= CLAIM_WINDOW_DAYS * DAY_MS;
  }
  return false;
};

export const fileClaim = async (matchId: string, userId: string, input: { description?: unknown; amount?: unknown }) => {
  const match = await loadMatch(matchId);
  if (!(await coveredPeople(match)).has(userId)) throw new HttpError('Only the workers on this job can claim', 403);
  if (!match.coverPolicyNumber) throw new HttpError('This job has no Job Cover', 409);
  if (!claimWindowOpen(match)) {
    throw new HttpError(`Claims can be made while the job is under way or up to ${CLAIM_WINDOW_DAYS} days after it is done`, 409);
  }
  const description = String(input.description ?? '').trim();
  const amount = Math.round(Number(input.amount));
  if (description.length < 20 || description.length > DESCRIPTION_MAX) {
    throw new HttpError('Describe what happened and the treatment needed (at least 20 characters)', 400);
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > COVER_LIMIT) {
    throw new HttpError(`The amount must be between 1 and ${COVER_LIMIT.toLocaleString()} RWF`, 400);
  }
  if (await CoverClaim.findOne({ where: { matchId, userId, status: 'submitted' } })) {
    throw new HttpError('You already have a claim being reviewed for this job', 409);
  }
  const tx = await Transaction.findOne({ where: { matchId }, attributes: ['id'] });
  return CoverClaim.create({
    transactionId: tx?.id ?? null,
    matchId,
    userId,
    description,
    amountRequested: amount,
    amountApproved: null,
    decisionNote: null,
    decidedBy: null,
    decidedAt: null,
  });
};

/** Admin: every claim, waiting ones first. */
export const listClaims = async () => {
  const claims = await CoverClaim.findAll({
    include: [
      { model: User, as: 'user', attributes: ['id', 'name'] },
      { model: Match, as: 'match', attributes: ['id', 'coverPolicyNumber'], include: [{ model: Gig, as: 'gig', attributes: ['id', 'title'] }] },
    ],
    order: [['createdAt', 'DESC']],
  });
  return claims.sort((a, b) => Number(a.status !== 'submitted') - Number(b.status !== 'submitted'));
};

export const decide = async (
  claimId: string,
  adminId: string,
  input: { status?: unknown; amountApproved?: unknown; note?: unknown },
) => {
  const claim = await CoverClaim.findByPk(claimId);
  if (!claim) throw new HttpError('Claim not found', 404);
  if (claim.status !== 'submitted') throw new HttpError('This claim has already been decided', 409);
  const note = String(input.note ?? '').trim();
  if (input.status === 'declined') {
    if (note.length < 5) throw new HttpError('Give the worker the reason for declining', 400);
    return claim.update({ status: 'declined', decisionNote: note, decidedBy: adminId, decidedAt: new Date() });
  }
  if (input.status !== 'approved') throw new HttpError("status must be 'approved' or 'declined'", 400);
  const amount = input.amountApproved == null ? claim.amountRequested : Math.round(Number(input.amountApproved));
  if (!Number.isFinite(amount) || amount < 1 || amount > claim.amountRequested) {
    throw new HttpError('The approved amount must be between 1 and the amount claimed', 400);
  }
  return claim.update({ status: 'approved', amountApproved: amount, decisionNote: note || null, decidedBy: adminId, decidedAt: new Date() });
};
