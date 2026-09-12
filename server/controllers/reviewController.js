const { Review, Match, Gig, User } = require('../models');
const notify = require('../lib/notify');
const trustScoreService = require('../services/trustScoreService');

exports.createReview = async (req, res) => {
  const { matchId, rating, comment } = req.body;
  if (!matchId || rating === undefined) {
    return res.status(400).json({ message: 'matchId and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'rating must be between 1 and 5' });
  }

  const match = await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] });
  if (!match) {
    return res.status(404).json({ message: 'Match not found' });
  }
  if (match.status !== 'completed') {
    return res.status(409).json({ message: 'Reviews can only be left for a completed match' });
  }

  const isWorker = match.workerId === req.user.id;
  const isClient = match.gig.clientId === req.user.id;
  if (!isWorker && !isClient) {
    return res.status(403).json({ message: 'Only the matched worker or the posting client may leave a review' });
  }

  const recipientId = isWorker ? match.gig.clientId : match.workerId;

  const existing = await Review.findOne({ where: { matchId, authorId: req.user.id } });
  if (existing) {
    return res.status(409).json({ message: 'You have already reviewed this match' });
  }

  const review = await Review.create({
    matchId,
    authorId: req.user.id,
    recipientId,
    rating,
    comment,
  });

  await trustScoreService.recalculate(recipientId);

  const author = await User.findByPk(req.user.id);
  await notify(req, {
    userId: recipientId,
    title: 'New review',
    body: `${author.name} left you a ${rating}-star review${match.gig ? ` for "${match.gig.title}"` : ''}.`,
  });

  res.status(201).json(review);
};

exports.listReviews = async (req, res) => {
  const where = req.query.recipientId ? { recipientId: req.query.recipientId } : undefined;
  const reviews = await Review.findAll({
    where,
    include: [{ model: User, as: 'author' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(reviews);
};
