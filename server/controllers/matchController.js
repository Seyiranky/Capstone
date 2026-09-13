const { Op } = require('sequelize');
const { Match, Gig, User, Transaction, Review, GigApplication } = require('../models');
const paymentService = require('../services/paymentService');
const trustScoreService = require('../services/trustScoreService');
const competenceService = require('../services/competenceService');
const notify = require('../lib/notify');

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
  const { status, declineReason } = req.body;
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

  // Acceptance is the worker's own signal; a client accepting on their behalf
  // would make the acceptance rate meaningless as a measure.
  if (status === 'accepted' && !isWorker) {
    return res.status(403).json({ message: 'Only the matched worker may accept this match' });
  }

  const wasPending = match.status === 'pending';
  const now = new Date();
  await match.update({
    status,
    // respondedAt means specifically "the worker answered". A client cancelling
    // a pending match is a withdrawal, not a decline, and must not land in the
    // denominator of the acceptance rate.
    ...(wasPending && isWorker ? { respondedAt: now } : {}),
    ...(status === 'accepted' ? { acceptedAt: now } : {}),
    ...(status === 'cancelled' && declineReason ? { declineReason } : {}),
  });

  if (status === 'accepted') {
    await match.gig.update({ status: 'matched' });

    // The gig is now taken: withdraw the other invitations and applications.
    // These carry no respondedAt, so they are excluded from acceptance-rate
    // measurement rather than counting as declines.
    const [siblingMatches, siblingApplications] = await Promise.all([
      Match.findAll({
        where: { gigId: match.gigId, status: 'pending', id: { [Op.ne]: match.id } },
      }),
      GigApplication.findAll({ where: { gigId: match.gigId, status: 'pending' } }),
    ]);

    await Promise.all([
      ...siblingMatches.map(async (other) => {
        await other.update({ status: 'cancelled' });
        await notify(req, {
          userId: other.workerId,
          title: 'Gig already filled',
          body: `"${match.gig.title}" was taken by another worker.`,
        });
      }),
      ...siblingApplications.map(async (other) => {
        await other.update({ status: 'rejected' });
        await notify(req, {
          userId: other.workerId,
          title: 'Application not selected',
          body: `Your application for "${match.gig.title}" was not selected.`,
        });
      }),
    ]);

    await notify(req, {
      userId: match.gig.clientId,
      title: 'Worker confirmed',
      body: `The worker confirmed they will take "${match.gig.title}".`,
    });
  }

  if (status === 'completed') {
    await paymentService.initiate(match, match.gig.budget);
    await match.gig.update({ status: 'completed' });
  }
  if (status === 'cancelled' && match.gig.status === 'matched') {
    // Siblings are still pending, so the gig goes back on the market intact.
    await match.gig.update({ status: 'open' });
    await notify(req, {
      userId: match.gig.clientId,
      title: wasPending ? 'Worker declined' : 'Match cancelled',
      body: `"${match.gig.title}" is open again${declineReason ? `: ${declineReason}` : '.'}`,
    });
  }

  // Completion and abandonment both feed the trust score's completion rate, so
  // it has to be recomputed here and not only when a review arrives.
  if (status === 'completed' || status === 'cancelled') {
    await trustScoreService.recalculate(match.workerId, { trigger: `match:${status}` });
    await trustScoreService.recalculate(match.gig.clientId, { trigger: `match:${status}` });
  }
  if (status === 'completed') {
    // Completed, reviewed work is itself a credential once there is enough of
    // it, so finishing a job can raise provenance for that skill.
    await competenceService.recalculateAllFor(match.workerId, { trigger: 'match:completed' });
  }

  const updated = await Match.findByPk(match.id, { include: MATCH_INCLUDES });
  res.json(updated);
};
