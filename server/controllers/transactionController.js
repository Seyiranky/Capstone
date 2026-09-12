const { Match, Gig, Transaction, User, Notification } = require('../models');
const paymentService = require('../services/paymentService');

const isPartyToMatch = (match, userId) => match.workerId === userId || match.gig.clientId === userId;

exports.initiateTransaction = async (req, res) => {
  const { matchId } = req.body;
  const match = await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] });
  if (!match) {
    return res.status(404).json({ message: 'Match not found' });
  }
  if (!isPartyToMatch(match, req.user.id)) {
    return res.status(403).json({ message: 'Only the matched worker or the posting client may initiate payment' });
  }
  if (match.status !== 'completed') {
    return res.status(409).json({ message: 'A transaction can only be initiated for a completed match' });
  }

  const existing = await Transaction.findOne({ where: { matchId } });
  if (existing) {
    return res.status(409).json({ message: 'A transaction already exists for this match', transaction: existing });
  }

  const transaction = await paymentService.initiate(match, match.gig.budget);
  res.status(201).json(transaction);
};

exports.confirmTransaction = async (req, res) => {
  const transaction = await Transaction.findByPk(req.params.id, {
    include: [{ model: Match, as: 'match', include: [{ model: Gig, as: 'gig' }] }],
  });
  if (!transaction) {
    return res.status(404).json({ message: 'Transaction not found' });
  }
  if (!isPartyToMatch(transaction.match, req.user.id)) {
    return res.status(403).json({ message: 'Only the matched worker or the posting client may confirm payment' });
  }

  const confirmed = await paymentService.confirm(transaction.id);

  await Notification.create({
    userId: transaction.match.workerId,
    title: 'Payment confirmed',
    body: `Payment for "${transaction.match.gig.title}" was confirmed (${confirmed.amount} RWF).`,
  });

  res.json(confirmed);
};

exports.listTransactions = async (req, res) => {
  const transactions = await Transaction.findAll({
    include: [
      {
        model: Match,
        as: 'match',
        include: [
          { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
          { model: User, as: 'worker' },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  const visible = transactions.filter((t) => isPartyToMatch(t.match, req.user.id) || req.user.role === 'admin');
  res.json(visible);
};
