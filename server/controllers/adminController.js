const { Op } = require('sequelize');
const { User, Gig, Skill, Match, Transaction, UserSkill } = require('../models');
const notify = require('../lib/notify');
const pilotMetricsService = require('../services/pilotMetricsService');
const matchScoringService = require('../services/matchScoringService');
const collusionDetectionService = require('../services/collusionDetectionService');
const skillVerificationService = require('../services/skillVerificationService');

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
  const report = await collusionDetectionService.report();
  res.json(report);
};

/**
 * Enrols or removes a reviewer.
 *
 * Peer reviewers must themselves be verified and well rated: someone with no
 * verified skill has no standing to certify another worker's.
 */
exports.setReviewerTier = async (req, res) => {
  const { reviewerTier } = req.body;
  if (![null, 'admin', 'peer'].includes(reviewerTier ?? null)) {
    return res.status(400).json({ message: "reviewerTier must be 'admin', 'peer' or null" });
  }

  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (reviewerTier === 'peer') {
    if (user.role !== 'worker') {
      return res.status(400).json({ message: 'Only workers can be enrolled as peer reviewers' });
    }
    const verifiedSkills = await UserSkill.count({
      where: { userId: user.id, verificationStatus: 'verified' },
    });
    if (verifiedSkills === 0) {
      return res
        .status(409)
        .json({ message: 'A peer reviewer must have at least one verified skill' });
    }
    if (user.trustScore < skillVerificationService.PEER_MIN_TRUST_SCORE) {
      return res.status(409).json({
        message: `A peer reviewer needs a trust score of at least ${skillVerificationService.PEER_MIN_TRUST_SCORE}`,
      });
    }
    if (user.reviewCount < skillVerificationService.PEER_MIN_REVIEWS) {
      return res.status(409).json({
        message: `A peer reviewer needs at least ${skillVerificationService.PEER_MIN_REVIEWS} reviews, not a score resting on the prior`,
      });
    }
  }

  await user.update({ reviewerTier: reviewerTier ?? null });

  if (reviewerTier) {
    await notify(req, {
      userId: user.id,
      title: 'You are now a skill reviewer',
      body: 'You can review skill submissions from other workers. Submissions are assigned to you automatically.',
    });
  }

  res.json(user);
};

exports.listReviewers = async (req, res) => {
  const reviewers = await User.findAll({
    where: { reviewerTier: { [Op.not]: null } },
    order: [['name', 'ASC']],
  });
  res.json(reviewers);
};

exports.pilotMetrics = async (req, res) => {
  const { from, to } = req.query;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return res.status(400).json({ message: 'from and to must be valid dates' });
  }

  const metrics = await pilotMetricsService.collect({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  res.json(metrics);
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

  await gig.update(
    decision === 'approved'
      ? { status: 'open', openedAt: new Date() }
      : { status: 'rejected' },
  );

  await notify(req, {
    userId: gig.clientId,
    title: decision === 'approved' ? 'Gig approved' : 'Gig rejected',
    body:
      decision === 'approved'
        ? `Your gig "${gig.title}" was approved and is now live for workers to apply to.`
        : `Your gig "${gig.title}" was rejected.`,
  });

  const invitations = decision === 'approved' ? await inviteRankedCandidates(req, gig) : [];

  res.json({ ...gig.toJSON(), invitations });
};

// Size of the ranked shortlist invited when a gig goes live. Set to 0 to run a
// pilot arm with manual applications only. Read per call so the arm can be
// switched without a restart.
const rankedInviteLimit = () => Number(process.env.RANKED_INVITE_LIMIT ?? 3);

/**
 * Invites the top-ranked eligible workers to a newly opened gig.
 *
 * These matches are born 'pending' with origin 'ranked', which is what gives
 * the pilot an acceptance rate to compare against the manual application arm
 * (RQ2). The full score breakdown is frozen onto each match so a ranking stays
 * reproducible after the weight profile is retuned.
 */
const inviteRankedCandidates = async (req, gig) => {
  const limit = rankedInviteLimit();
  if (limit <= 0) return [];

  const candidates = await matchScoringService.rankCandidates({ gig });
  const shortlist = candidates
    .filter((candidate) => candidate.eligibleForInvite && candidate.workerId !== gig.clientId)
    .slice(0, limit);

  const invitations = [];
  for (const candidate of shortlist) {
    const match = await Match.create({
      gigId: gig.id,
      workerId: candidate.workerId,
      status: 'pending',
      origin: 'ranked',
      rankScore: candidate.score,
      scoreBreakdown: candidate,
      weightProfileId: candidate.weightProfile.id,
    });
    await notify(req, {
      userId: candidate.workerId,
      title: 'You were matched to a new gig',
      body: `"${gig.title}" looks like a fit for you. Confirm if you can take it.`,
    });
    invitations.push(match);
  }

  return invitations;
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
