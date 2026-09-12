const { GigApplication, Gig, User, Match } = require('../models');
const notify = require('../lib/notify');

const APPLICATION_INCLUDES = [
  { model: Gig, as: 'gig' },
  { model: User, as: 'worker' },
];

exports.applyToGig = async (req, res) => {
  const { gigId } = req.body;
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

  const application = await GigApplication.create({ gigId, workerId: req.user.id, status: 'pending' });

  const worker = await User.findByPk(req.user.id);
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

  const match = await Match.create({
    gigId: application.gigId,
    workerId: application.workerId,
    status: 'accepted',
  });
  await application.gig.update({ status: 'matched' });

  const otherPending = await GigApplication.findAll({
    where: { gigId: application.gigId, status: 'pending' },
  });
  await Promise.all(
    otherPending.map(async (other) => {
      await other.update({ status: 'rejected' });
      await notify(req, {
        userId: other.workerId,
        title: 'Application not selected',
        body: `Your application for "${application.gig.title}" was not selected.`,
      });
    }),
  );

  await notify(req, {
    userId: application.workerId,
    title: 'Application approved',
    body: `Your application for "${application.gig.title}" was approved. You're now assigned to this gig.`,
  });
  await notify(req, {
    userId: application.gig.clientId,
    title: 'Gig assigned',
    body: `Your gig "${application.gig.title}" has been assigned to a worker.`,
  });

  res.json({ application, match });
};
