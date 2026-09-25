const { GigApplication, Gig, User, Match } = require('../models');
const matchScoringService = require('../services/matchScoringService');
const notify = require('../lib/notify');

const APPLICATION_INCLUDES = [
  { model: Gig, as: 'gig' },
  { model: User, as: 'worker' },
];

exports.applyToGig = async (req, res) => {
  const { gigId, occurredAt, queuedOffline } = req.body;
  if (!gigId) {
    return res.status(400).json({ message: 'gigId is required' });
  }

  const gig = await Gig.findByPk(gigId);
  if (!gig) {
    return res.status(404).json({ message: 'Gig not found' });
  }
  if (gig.status !== 'open') {
    return res.status(409).json({ message: 'This gig is not open for applications' });
  }

  const existing = await GigApplication.findOne({ where: { gigId, workerId: req.user.id } });
  if (existing) {
    return res.status(409).json({ message: 'You have already applied to this gig' });
  }

  // A ranked invitation is already an offer to this worker; applying on top of
  // it would create a second match for the same pair.
  const invited = await Match.findOne({
    where: { gigId, workerId: req.user.id, status: 'pending' },
  });
  if (invited) {
    return res
      .status(409)
      .json({ message: 'You were already matched to this gig — confirm that invitation instead' });
  }

  // Score the pair now so the client's review queue is ranked and explainable.
  // A worker with no record of the skill is still allowed to apply; they simply
  // score zero on skill fit and the breakdown says so.
  const worker = await User.findByPk(req.user.id);
  const scored = await matchScoringService.scoreOne({ gig, worker });

  const now = new Date();
  const claimed = occurredAt ? new Date(occurredAt) : null;
  const occurred =
    queuedOffline && claimed && !Number.isNaN(claimed.getTime()) && claimed <= now
      ? claimed
      : null;

  const application = await GigApplication.create({
    gigId,
    workerId: req.user.id,
    status: 'pending',
    occurredAt: occurred ?? now,
    wasQueuedOffline: Boolean(occurred),
    rankScore: scored.score,
    scoreBreakdown: scored,
    weightProfileId: scored.weightProfile.id,
  });

  const admins = await User.findAll({ where: { role: 'admin' } });
  await Promise.all(
    admins.map((admin) =>
      notify(req, {
        userId: admin.id,
        title: 'New gig application',
        body: `${worker.name} applied to "${gig.title}".`,
      }),
    ),
  );

  res.status(201).json(application);
};

exports.listApplications = async (req, res) => {
  const where = {};
  if (req.query.gigId) {
    where.gigId = req.query.gigId;
  }
  if (req.user.role === 'worker') {
    where.workerId = req.user.id;
  }

  const applications = await GigApplication.findAll({
    where,
    include: APPLICATION_INCLUDES,
    order: [['createdAt', 'DESC']],
  });

  const visible =
    req.user.role === 'client'
      ? applications.filter((application) => application.gig.clientId === req.user.id)
      : applications;

  res.json(visible);
};

exports.reviewApplication = async (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
  }

  const application = await GigApplication.findByPk(req.params.id, { include: APPLICATION_INCLUDES });
  if (!application) {
    return res.status(404).json({ message: 'Application not found' });
  }
  if (application.status !== 'pending') {
    return res.status(409).json({ message: 'This application has already been reviewed' });
  }

  if (decision === 'rejected') {
    await application.update({ status: 'rejected' });
    await notify(req, {
      userId: application.workerId,
      title: 'Application not selected',
      body: `Your application for "${application.gig.title}" was not selected.`,
    });
    return res.json({ application });
  }

  await application.update({ status: 'approved' });

  // Born pending, not accepted: the worker confirms they are still available.
  // Sibling applications stay pending until that confirmation, so a decline
  // leaves the gig fillable instead of stranding it with no candidates.
  const match = await Match.create({
    gigId: application.gigId,
    workerId: application.workerId,
    status: 'pending',
    origin: 'manual',
  });
  await application.gig.update({ status: 'matched' });

  await notify(req, {
    userId: application.workerId,
    title: 'Application approved',
    body: `Your application for "${application.gig.title}" was approved. Confirm you're still available to take it.`,
  });
  await notify(req, {
    userId: application.gig.clientId,
    title: 'Worker selected',
    body: `A worker was selected for "${application.gig.title}" and has been asked to confirm.`,
  });

  res.json({ application, match });
};
