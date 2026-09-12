const { Match, Gig, User, Transaction, Review } = require('../models');
const paymentService = require('../services/paymentService');

const MATCH_INCLUDES = [
  { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
  { model: User, as: 'worker' },
  { model: Transaction, as: 'transaction' },
  { model: Review, as: 'reviews' },
];

exports.listMatches = async (req, res) => {
  let matches;
  if (req.user.role === 'worker') {
    matches = await Match.findAll({ where: { workerId: req.user.id }, include: MATCH_INCLUDES });
  } else if (req.user.role === 'admin') {
    matches = await Match.findAll({ include: MATCH_INCLUDES });
  } else {
    matches = await Match.findAll({
      include: [{ ...MATCH_INCLUDES[0], where: { clientId: req.user.id } }, ...MATCH_INCLUDES.slice(1)],
    });
  }
  res.json(matches);
};

const ALLOWED_TRANSITIONS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

exports.updateMatchStatus = async (req, res) => {
  const { status } = req.body;
  const match = await Match.findByPk(req.params.id, { include: [{ model: Gig, as: 'gig' }] });
  if (!match) {
    return res.status(404).json({ message: 'Match not found' });
  }

  const isWorker = match.workerId === req.user.id;
  const isClient = match.gig.clientId === req.user.id;
  if (!isWorker && !isClient) {
    return res.status(403).json({ message: 'Only the matched worker or the posting client may update this match' });
  }

  if (!ALLOWED_TRANSITIONS[match.status]?.includes(status)) {
    return res.status(409).json({
      message: `Cannot transition match from '${match.status}' to '${status}'`,
    });
  }

  await match.update({ status });

  if (status === 'completed') {
    await paymentService.initiate(match, match.gig.budget);
    await match.gig.update({ status: 'completed' });
  }
  if (status === 'cancelled' && match.gig.status === 'matched') {
    await match.gig.update({ status: 'open' });
  }

  const updated = await Match.findByPk(match.id, { include: MATCH_INCLUDES });
  res.json(updated);
};
