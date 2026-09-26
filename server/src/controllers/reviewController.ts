import type { Request, Response } from 'express';
import { Review, Match, Gig, User } from '../models';
import notify from '../lib/notify';
import * as trustScoreService from '../services/trustScoreService';
import * as competenceService from '../services/competenceService';
import { authed } from '../lib/authed';
import { stringParam } from '../lib/query';

export const createReview = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const { matchId, rating, comment } = req.body ?? {};
  if (!matchId || rating === undefined) {
    res.status(400).json({ message: 'matchId and rating are required' });
    return;
  }
  if (rating < 1 || rating > 5) {
    res.status(400).json({ message: 'rating must be between 1 and 5' });
    return;
  }

  const match = await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] });
  if (!match) {
    res.status(404).json({ message: 'Match not found' });
    return;
  }
  if (match.status !== 'completed') {
    res.status(409).json({ message: 'Reviews can only be left for a completed match' });
    return;
  }

  const isWorker = match.workerId === user.id;
  const isClient = match.gig?.clientId === user.id;
  if (!isWorker && !isClient) {
    res
      .status(403)
      .json({ message: 'Only the matched worker or the posting client may leave a review' });
    return;
  }

  const recipientId = isWorker ? (match.gig?.clientId as string) : match.workerId;

  const existing = await Review.findOne({ where: { matchId, authorId: user.id } });
  if (existing) {
    res.status(409).json({ message: 'You have already reviewed this match' });
    return;
  }

  const review = await Review.create({
    matchId,
    authorId: user.id,
    recipientId,
    rating,
    comment,
  });

  await trustScoreService.recalculate(recipientId);
  // work_earned counts reviewed jobs, so a review can be the thing that tips it.
  await competenceService.recalculateAllFor(recipientId, { trigger: 'review:created' });

  const author = await User.findByPk(user.id);
  await notify(req, {
    userId: recipientId,
    title: 'New review',
    body: `${author?.name} left you a ${rating}-star review${match.gig ? ` for "${match.gig.title}"` : ''}.`,
  });

  res.status(201).json(review);
};

export const listReviews = async (req: Request, res: Response): Promise<void> => {
  const recipientId = stringParam(req, 'recipientId');
  const reviews = await Review.findAll({
    where: recipientId ? { recipientId } : undefined,
    include: [{ model: User, as: 'author' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(reviews);
};
