const { User, Gig, Skill, Match, Transaction } = require('../models');
const notify = require('../lib/notify');

exports.listUsers = async (req, res) => {
  const users = await User.findAll({ order: [['createdAt', 'DESC']] });
  res.json(users);
};

exports.listGigs = async (req, res) => {
  const gigs = await Gig.findAll({
    include: [
      { model: User, as: 'client' },
      { model: Skill, as: 'skill' },
      {
        model: Match,
        as: 'matches',
        include: [
          { model: User, as: 'worker' },
          { model: Transaction, as: 'transaction' },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
  res.json(gigs);
};

exports.listFlagged = async (req, res) => {
  res.status(501).json({ message: 'Not implemented' });
};

exports.reviewGig = async (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
  }

  const gig = await Gig.findByPk(req.params.id);
  if (!gig) {
    return res.status(404).json({ message: 'Gig not found' });
  }
  if (gig.status !== 'pending_review') {
    return res.status(409).json({ message: 'This gig has already been reviewed' });
  }

  await gig.update({ status: decision === 'approved' ? 'open' : 'rejected' });

  await notify(req, {
    userId: gig.clientId,
    title: decision === 'approved' ? 'Gig approved' : 'Gig rejected',
    body:
      decision === 'approved'
        ? `Your gig "${gig.title}" was approved and is now live for workers to apply to.`
        : `Your gig "${gig.title}" was rejected.`,
  });

  res.json(gig);
};

exports.moderateUser = async (req, res) => {
  const { action } = req.body;
  if (!['suspend', 'activate'].includes(action)) {
    return res.status(400).json({ message: "action must be 'suspend' or 'activate'" });
  }

  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (user.role === 'admin') {
    return res.status(403).json({ message: 'Admins cannot be suspended' });
  }
  if (user.id === req.user.id) {
    return res.status(403).json({ message: 'You cannot moderate your own account' });
  }

  await user.update({ status: action === 'suspend' ? 'suspended' : 'active' });

  await notify(req, {
    userId: user.id,
    title: action === 'suspend' ? 'Account suspended' : 'Account reactivated',
    body:
      action === 'suspend'
        ? 'An administrator has suspended your account. Contact support if you believe this is a mistake.'
        : 'Your account has been reactivated. You can log in again.',
  });

  res.json(user);
};

exports.deleteUser = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (user.role === 'admin') {
    return res.status(403).json({ message: 'Admins cannot be deleted' });
  }
  if (user.id === req.user.id) {
    return res.status(403).json({ message: 'You cannot delete your own account' });
  }

  await user.destroy();
  res.json({ message: 'User deleted' });
};
