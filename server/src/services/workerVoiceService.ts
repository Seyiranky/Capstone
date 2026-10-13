import { Op, fn, col } from 'sequelize';
import { Payout, Poll, PollVote, User } from '../models';
import { HttpError } from '../lib/httpError';

/**
 * Worker Voice.
 *
 * Who may vote is decided by the record, not by role alone: a worker with at
 * least one paid job on Isoko. That keeps the vote with the people whose
 * livelihood the rules affect, and makes buying votes with new accounts pointless.
 */
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export const canVote = async (userId: string): Promise<boolean> =>
  (await Payout.count({ where: { userId } })) > 0;

export type PollPhase = 'voting' | 'awaiting_response' | 'closed';

const phaseOf = (poll: Poll, now = Date.now()): PollPhase =>
  poll.status === 'closed' ? 'closed' : poll.closesAt.getTime() > now ? 'voting' : 'awaiting_response';

/** Every poll with its counts, newest first; for a worker, whether and how they voted. */
export const list = async (viewer?: { id: string; role: string }) => {
  const polls = await Poll.findAll({ order: [['createdAt', 'DESC']] });
  const rows = (await PollVote.findAll({
    attributes: ['pollId', 'optionIndex', [fn('COUNT', col('id')), 'count']],
    group: ['pollId', 'optionIndex'],
    raw: true,
  })) as unknown as { pollId: string; optionIndex: number; count: string }[];
  const mine = viewer
    ? new Map((await PollVote.findAll({ where: { userId: viewer.id } })).map((v) => [v.pollId, v.optionIndex]))
    : new Map<string, number>();
  const eligible = viewer?.role === 'worker' ? await canVote(viewer.id) : false;

  return polls.map((poll) => {
    const counts = poll.options.map((_, i) => Number(rows.find((r) => r.pollId === poll.id && r.optionIndex === i)?.count ?? 0));
    const phase = phaseOf(poll);
    return {
      id: poll.id,
      question: poll.question,
      details: poll.details,
      options: poll.options,
      counts,
      total: counts.reduce((a, b) => a + b, 0),
      phase,
      closesAt: poll.closesAt,
      closedAt: poll.closedAt,
      outcome: poll.outcome,
      createdAt: poll.createdAt,
      myVote: mine.get(poll.id) ?? null,
      canVote: eligible && phase === 'voting' && !mine.has(poll.id),
    };
  });
};

export const vote = async (pollId: string, userId: string, optionIndex: number) => {
  const poll = await Poll.findByPk(pollId);
  if (!poll) throw new HttpError('Poll not found', 404);
  if (phaseOf(poll) !== 'voting') throw new HttpError('Voting on this poll has ended', 409);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    throw new HttpError('Choose one of the options', 400);
  }
  if (!(await canVote(userId))) {
    throw new HttpError('Workers can vote once they have been paid for a job through Isoko', 403);
  }
  const [, created] = await PollVote.findOrCreate({ where: { pollId, userId }, defaults: { pollId, userId, optionIndex } });
  if (!created) throw new HttpError('You have already voted on this', 409);
};

export const create = async (
  adminId: string,
  input: { question?: unknown; details?: unknown; options?: unknown; closesInDays?: unknown },
) => {
  const question = String(input.question ?? '').trim();
  const details = String(input.details ?? '').trim() || null;
  const options = Array.isArray(input.options)
    ? input.options.map((o) => String(o ?? '').trim()).filter(Boolean)
    : [];
  const days = Number(input.closesInDays ?? 7);
  if (!question || question.length > 200) throw new HttpError('A question of up to 200 characters is required', 400);
  if (details && details.length > 1000) throw new HttpError('Details can be at most 1000 characters', 400);
  if (options.length < OPTIONS_MIN || options.length > OPTIONS_MAX || options.some((o) => o.length > 80)) {
    throw new HttpError(`Give ${OPTIONS_MIN} to ${OPTIONS_MAX} options of up to 80 characters`, 400);
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new HttpError('Options must differ', 400);
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new HttpError('Voting must run for 1 to 30 days', 400);
  return Poll.create({
    question,
    details,
    options,
    closesAt: new Date(Date.now() + days * DAY_MS),
    createdBy: adminId,
    outcome: null,
    closedAt: null,
  });
};

/** Closes a poll with the platform's response. Allowed early, so a clear result can be acted on. */
export const close = async (pollId: string, outcome: unknown) => {
  const poll = await Poll.findByPk(pollId);
  if (!poll) throw new HttpError('Poll not found', 404);
  if (poll.status === 'closed') throw new HttpError('This poll is already closed', 409);
  const text = String(outcome ?? '').trim();
  if (text.length < 10 || text.length > 1000) {
    throw new HttpError('Say what the platform will do about the result (10 to 1000 characters)', 400);
  }
  await poll.update({ status: 'closed', outcome: text, closedAt: new Date() });
  return poll;
};

/** Workers who may vote, to tell them a poll is open. */
export const voters = async () => {
  const ids = (await Payout.findAll({ attributes: ['userId'], group: ['userId'], raw: true })) as unknown as { userId: string }[];
  return User.findAll({ where: { id: { [Op.in]: ids.map((r) => r.userId) }, role: 'worker', status: 'active' }, attributes: ['id'] });
};

/** For the Fairwork scorecard: polls in the last year that workers voted on and the platform answered. */
export const decidedThisYear = async () => {
  const polls = await Poll.findAll({
    where: { status: 'closed', closedAt: { [Op.gte]: new Date(Date.now() - 365 * DAY_MS) }, outcome: { [Op.ne]: null } },
    attributes: ['id'],
  });
  if (!polls.length) return 0;
  const voted = await PollVote.count({ where: { pollId: polls.map((p) => p.id) }, distinct: true, col: 'pollId' });
  return voted;
};
