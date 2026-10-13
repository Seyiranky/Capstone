import { CoverClaim, Gig, Match, MatchMember, Skill, Transaction, User } from '../models';
import { HttpError } from '../lib/httpError';
import { CLAIM_WINDOW_DAYS, COVER_LIMIT, isOnSite, policyNumber, premiumFor } from '../lib/jobCover';

const DAY_MS = 24 * 60 * 60 * 1000;
const DESCRIPTION_MAX = 2000;

type MatchWithGig = Match & { gig?: Gig & { skill?: Skill | null } };

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
 * Adds cover to a payment as the client funds it. Only for on-site trades,
 * once per job, and by the client.
 */
export const buy = async (transaction: Transaction, match: MatchWithGig, clientId: string) => {
  if (match.gig?.clientId !== clientId) throw new HttpError('Only the client can add Job Cover', 403);
  if (!isOnSite(match.gig?.skill?.category)) throw new HttpError('Job Cover is for work done on site', 400);
  if (transaction.coverPolicyNumber) return transaction;
  return transaction.update({ coverPremium: premiumFor(Number(transaction.amount)), coverPolicyNumber: policyNumber() });
};

/** What a party to the job sees: whether it can be or is covered, and the claims on it. */
export const status = async (matchId: string, viewer: { id: string; role: string }) => {
  const match = await loadMatch(matchId);
  const people = await coveredPeople(match);
  const isParty = people.has(viewer.id) || match.gig?.clientId === viewer.id;
  if (!isParty && viewer.role !== 'admin') throw new HttpError('Only people on this job can see its cover', 403);
  const tx = await Transaction.findOne({ where: { matchId } });
  const claims = await CoverClaim.findAll({
    where: { matchId, ...(viewer.role === 'admin' || match.gig?.clientId === viewer.id ? {} : { userId: viewer.id }) },
    order: [['createdAt', 'DESC']],
  });
  const price = Number(tx?.amount ?? match.agreedAmount ?? match.gig?.budget ?? 0);
  return {
    eligible: isOnSite(match.gig?.skill?.category),
    covered: Boolean(tx?.coverPolicyNumber),
    policyNumber: tx?.coverPolicyNumber ?? null,
    premium: tx?.coverPremium != null ? Number(tx.coverPremium) : premiumFor(price),
    limit: COVER_LIMIT,
    claimWindowDays: CLAIM_WINDOW_DAYS,
    canClaim:
      Boolean(tx?.coverPolicyNumber) &&
      people.has(viewer.id) &&
      claimWindowOpen(tx) &&
      !claims.some((c) => c.userId === viewer.id && c.status === 'submitted'),
    claims,
  };
};

const claimWindowOpen = (tx: Transaction | null) => {
  if (!tx || !tx.coverPolicyNumber) return false;
  if (tx.escrowStatus === 'held') return true;
  if (tx.escrowStatus === 'released' && tx.releasedAt) return Date.now() - tx.releasedAt.getTime() <= CLAIM_WINDOW_DAYS * DAY_MS;
  return false;
};

export const fileClaim = async (matchId: string, userId: string, input: { description?: unknown; amount?: unknown }) => {
  const match = await loadMatch(matchId);
  if (!(await coveredPeople(match)).has(userId)) throw new HttpError('Only the workers on this job can claim', 403);
  const tx = await Transaction.findOne({ where: { matchId } });
  if (!tx?.coverPolicyNumber) throw new HttpError('This job has no Job Cover', 409);
  if (!claimWindowOpen(tx)) {
    throw new HttpError(`Claims can be made while the job is under way or up to ${CLAIM_WINDOW_DAYS} days after it is paid`, 409);
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
  return CoverClaim.create({
    transactionId: tx.id,
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
      { model: Transaction, as: 'transaction', attributes: ['coverPolicyNumber', 'amount'] },
      { model: Match, as: 'match', include: [{ model: Gig, as: 'gig', attributes: ['id', 'title'] }] },
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
