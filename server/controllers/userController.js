const { User, UserSkill, Skill, SkillTask, Gig, Match, Transaction, Review, Message } = require('../models');

exports.getProfile = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
};

const UPDATABLE_FIELDS = ['name', 'bio', 'locationLat', 'locationLng'];

exports.updateProfile = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const updates = {};
  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  await user.update(updates);
  res.json(user);
};

exports.getPublicProfile = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    bio: user.bio,
    trustScore: user.trustScore,
    createdAt: user.createdAt,
  });
};

exports.getUserSkills = async (req, res) => {
  const userSkills = await UserSkill.findAll({
    where: { userId: req.params.id, verificationStatus: 'verified' },
    include: [{ model: Skill, as: 'skill' }],
    order: [['createdAt', 'ASC']],
  });
  res.json(userSkills);
};

exports.exportMyData = async (req, res) => {
  const userId = req.user.id;

  const [
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  ] = await Promise.all([
    User.findByPk(userId),
    SkillTask.findAll({ where: { workerId: userId } }),
    SkillTask.findAll({ where: { reviewerId: userId } }),
    Gig.findAll({ where: { clientId: userId } }),
    Match.findAll({ where: { workerId: userId } }),
    Match.findAll({ include: [{ model: Gig, as: 'gig', where: { clientId: userId }, required: true }] }),
    Review.findAll({ where: { authorId: userId } }),
    Review.findAll({ where: { recipientId: userId } }),
    Message.findAll({ where: { senderId: userId } }),
    Message.findAll({ where: { recipientId: userId } }),
  ]);

  const matchIds = [...matchesAsWorker, ...matchesAsClient].map((m) => m.id);
  const transactions = matchIds.length
    ? await Transaction.findAll({ where: { matchId: matchIds } })
    : [];

  res.setHeader('Content-Disposition', 'attachment; filename="isoko-talents-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    transactions,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  });
};
