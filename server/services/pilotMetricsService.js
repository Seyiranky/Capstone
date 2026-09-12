const { Op } = require('sequelize');
const { Match, Gig, SkillTask } = require('../models');

const HOUR_MS = 1000 * 60 * 60;

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const summarise = (values) => ({
  n: values.length,
  meanHours: mean(values),
  medianHours: median(values),
});

/**
 * Acceptance rate counts only matches the worker themselves answered.
 *
 * respondedAt is set only by a worker acting on their own match, so three
 * groups are excluded from the denominator, each for a different reason:
 * matches still pending (no answer yet), matches withdrawn by the client, and
 * invitations superseded when another worker took the gig. Counting any of
 * those as declines would understate how willing workers are to accept.
 */
const acceptanceFor = (matches) => {
  const responded = matches.filter((match) => match.respondedAt);
  const accepted = responded.filter((match) => match.acceptedAt);
  const awaiting = matches.filter((match) => match.status === 'pending');
  return {
    total: matches.length,
    awaitingResponse: awaiting.length,
    withdrawnOrSuperseded: matches.length - responded.length - awaiting.length,
    responded: responded.length,
    accepted: accepted.length,
    declined: responded.length - accepted.length,
    acceptanceRate: responded.length ? accepted.length / responded.length : null,
    responseTime: summarise(
      responded.map((match) => (match.respondedAt - match.createdAt) / HOUR_MS),
    ),
  };
};

const groupBy = (items, keyOf) =>
  items.reduce((acc, item) => {
    const key = keyOf(item) ?? 'none';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

const mapValues = (obj, fn) =>
  Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fn(value)]));

exports.collect = async ({ from, to } = {}) => {
  const createdAt = {};
  if (from) createdAt[Op.gte] = from;
  if (to) createdAt[Op.lte] = to;
  const dateFilter = Object.keys(createdAt).length ? { createdAt } : {};

  const matches = await Match.findAll({ where: dateFilter });

  // Time-to-first-match runs from the moment a gig went live (openedAt), not
  // from when it was posted, since it sits in the approval queue until then.
  const gigs = await Gig.findAll({
    where: { ...dateFilter, openedAt: { [Op.not]: null } },
    include: [{ model: Match, as: 'matches' }],
  });

  const timeToFirstMatch = [];
  const timeToFirstAccepted = [];
  let openedNeverMatched = 0;

  for (const gig of gigs) {
    const gigMatches = gig.matches || [];
    if (gigMatches.length === 0) {
      openedNeverMatched += 1;
      continue;
    }
    const firstCreated = Math.min(...gigMatches.map((m) => m.createdAt.getTime()));
    timeToFirstMatch.push((firstCreated - gig.openedAt.getTime()) / HOUR_MS);

    const acceptedTimes = gigMatches.filter((m) => m.acceptedAt).map((m) => m.acceptedAt.getTime());
    if (acceptedTimes.length) {
      timeToFirstAccepted.push((Math.min(...acceptedTimes) - gig.openedAt.getTime()) / HOUR_MS);
    }
  }

  const tasks = await SkillTask.findAll({ where: dateFilter });
  const decided = tasks.filter((task) => task.status !== 'pending');
  // updatedAt approximates the decision time; SkillTaskAssignments.decidedAt
  // will make this exact once per-reviewer assignment rounds land.
  const reviewTurnaround = decided.map(
    (task) => (task.updatedAt - task.createdAt) / HOUR_MS,
  );

  return {
    window: { from: from || null, to: to || null },
    matchAcceptance: {
      overall: acceptanceFor(matches),
      byOrigin: mapValues(groupBy(matches, (m) => m.origin), acceptanceFor),
      byWeightProfile: mapValues(groupBy(matches, (m) => m.weightProfileId), acceptanceFor),
    },
    timeToFirstMatch: {
      gigsOpened: gigs.length,
      openedNeverMatched,
      toFirstMatch: summarise(timeToFirstMatch),
      toFirstAcceptedMatch: summarise(timeToFirstAccepted),
    },
    skillReviewTurnaround: {
      submitted: tasks.length,
      pending: tasks.length - decided.length,
      approved: decided.filter((task) => task.status === 'approved').length,
      rejected: decided.filter((task) => task.status === 'rejected').length,
      turnaround: summarise(reviewTurnaround),
    },
  };
};
