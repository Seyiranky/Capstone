const { SkillTask, SkillTaskAssignment, User, Match, Gig } = require('../models');

// A decision this fast cannot involve examining the evidence.
const RUBBER_STAMP_SECONDS = 60;

// Flag at two standard deviations: conventional, and it keeps the report short
// enough to actually be triaged in a pilot of this size.
const SIGMA_THRESHOLD = 2;

const MIN_REVIEWS_FOR_RATE_COMPARISON = 5;

const mean = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

const stdDev = (values) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

/**
 * Expected pairings and spread if assignment were uniform over the pool.
 *
 * Each assignment is treated as an independent draw, so a reviewer's share of
 * one worker's tasks is Binomial(n, 1/pool). A pair well above that is what
 * steered assignment would look like.
 */
const binomialExpectation = (taskCount, poolSize) => {
  if (!poolSize || poolSize < 2) return null;
  const p = 1 / poolSize;
  return { expected: taskCount * p, sd: Math.sqrt(taskCount * p * (1 - p)) };
};

/** Worker–reviewer pairs that recur more often than chance would produce. */
const pairCoOccurrence = (assignments) => {
  const byWorker = new Map();
  for (const a of assignments) {
    const workerId = a.task?.workerId;
    if (!workerId) continue;
    if (!byWorker.has(workerId)) byWorker.set(workerId, []);
    byWorker.get(workerId).push(a);
  }

  const flags = [];
  for (const [workerId, workerAssignments] of byWorker) {
    const taskCount = new Set(workerAssignments.map((a) => a.taskId)).size;
    if (taskCount < 3) continue;

    const poolSizes = workerAssignments.map((a) => a.eligiblePoolSize).filter(Boolean);
    const poolSize = poolSizes.length ? Math.round(mean(poolSizes)) : null;
    const stats = binomialExpectation(taskCount, poolSize);
    if (!stats || stats.sd === 0) continue;

    const counts = workerAssignments.reduce(
      (map, a) => map.set(a.reviewerId, (map.get(a.reviewerId) || 0) + 1),
      new Map(),
    );

    for (const [reviewerId, count] of counts) {
      const threshold = stats.expected + SIGMA_THRESHOLD * stats.sd;
      if (count > threshold) {
        flags.push({
          type: 'repeatedPairing',
          severity: count >= threshold * 1.5 ? 'high' : 'medium',
          workerId,
          workerName: workerAssignments.find((a) => a.task?.workerId === workerId)?.task?.worker
            ?.name,
          reviewerId,
          evidence: {
            pairings: count,
            workerTasks: taskCount,
            eligiblePoolSize: poolSize,
            expectedPairings: Number(stats.expected.toFixed(2)),
            standardDeviations: Number(((count - stats.expected) / stats.sd).toFixed(2)),
          },
        });
      }
    }
  }
  return flags;
};

/** Reviewers whose approval rate departs from their peers'. */
const approvalRateOutliers = (assignments) => {
  const decided = assignments.filter((a) => ['approved', 'rejected'].includes(a.status));
  const byReviewer = decided.reduce((map, a) => {
    if (!map.has(a.reviewerId)) map.set(a.reviewerId, []);
    map.get(a.reviewerId).push(a);
    return map;
  }, new Map());

  const rates = [...byReviewer.entries()]
    .filter(([, rows]) => rows.length >= MIN_REVIEWS_FOR_RATE_COMPARISON)
    .map(([reviewerId, rows]) => ({
      reviewerId,
      reviewerName: rows[0].reviewer?.name,
      decisions: rows.length,
      rate: rows.filter((r) => r.status === 'approved').length / rows.length,
    }));

  if (rates.length < 3) return [];

  const values = rates.map((r) => r.rate);
  const peerMean = mean(values);
  const sd = stdDev(values);
  if (sd === 0) return [];

  return rates
    .filter((r) => Math.abs(r.rate - peerMean) > SIGMA_THRESHOLD * sd)
    .map((r) => ({
      type: r.rate > peerMean ? 'approvesEverything' : 'rejectsEverything',
      severity: 'medium',
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerName,
      evidence: {
        approvalRate: Number(r.rate.toFixed(2)),
        peerMean: Number(peerMean.toFixed(2)),
        decisions: r.decisions,
        standardDeviations: Number(((r.rate - peerMean) / sd).toFixed(2)),
      },
    }));
};

/**
 * Decisions returned too fast to have involved reviewing the evidence.
 *
 * Only assignments the platform actually timed are considered. Rows backfilled
 * from tasks that predate per-round tracking carry no assignmentSeed and an
 * approximated assignedAt, which would otherwise read as instant decisions and
 * bury the real signal.
 */
const rubberStamps = (assignments) =>
  assignments
    .filter((a) => a.decidedAt && a.assignedAt && a.status === 'approved' && a.assignmentSeed)
    .map((a) => ({ a, seconds: (a.decidedAt - a.assignedAt) / 1000 }))
    .filter(({ seconds }) => seconds >= 0 && seconds < RUBBER_STAMP_SECONDS)
    .map(({ a, seconds }) => ({
      type: 'rubberStamped',
      severity: 'high',
      taskId: a.taskId,
      workerId: a.task?.workerId,
      workerName: a.task?.worker?.name,
      reviewerId: a.reviewerId,
      reviewerName: a.reviewer?.name,
      evidence: {
        secondsToDecision: Number(seconds.toFixed(1)),
        thresholdSeconds: RUBBER_STAMP_SECONDS,
      },
    }));

/**
 * Reviewers who have a prior gig relationship with the worker they approved.
 *
 * assignReviewer excludes these up front, so anything appearing here was either
 * assigned before the rule existed or formed a relationship afterwards.
 */
const priorRelationships = async (assignments) => {
  const workerIds = [...new Set(assignments.map((a) => a.task?.workerId).filter(Boolean))];
  if (workerIds.length === 0) return [];

  const matches = await Match.findAll({
    where: { workerId: workerIds },
    include: [{ model: Gig, as: 'gig', attributes: ['clientId'] }],
    attributes: ['workerId'],
  });

  const pairs = new Set(
    matches.filter((m) => m.gig?.clientId).map((m) => `${m.workerId}:${m.gig.clientId}`),
  );

  return assignments
    .filter(
      (a) =>
        a.task?.workerId &&
        ['approved', 'rejected'].includes(a.status) &&
        pairs.has(`${a.task.workerId}:${a.reviewerId}`),
    )
    .map((a) => ({
      type: 'priorGigRelationship',
      severity: 'high',
      taskId: a.taskId,
      workerId: a.task.workerId,
      workerName: a.task?.worker?.name,
      reviewerId: a.reviewerId,
      reviewerName: a.reviewer?.name,
      evidence: { relationship: 'worked together on a gig', decision: a.status },
    }));
};

/**
 * Audits reviewer assignment for signs of worker–reviewer collusion (RQ1).
 *
 * Every flag carries the numbers behind it so an assessor can judge the claim
 * rather than trust the label. A flag is a prompt to look, not a finding of
 * misconduct.
 */
exports.report = async () => {
  const assignments = await SkillTaskAssignment.findAll({
    include: [
      {
        model: SkillTask,
        as: 'task',
        include: [{ model: User, as: 'worker', attributes: ['id', 'name'] }],
      },
      { model: User, as: 'reviewer', attributes: ['id', 'name', 'reviewerTier'] },
    ],
  });

  const [relationshipFlags] = await Promise.all([priorRelationships(assignments)]);

  const flags = [
    ...rubberStamps(assignments),
    ...relationshipFlags,
    ...pairCoOccurrence(assignments),
    ...approvalRateOutliers(assignments),
  ];

  const severityRank = { high: 0, medium: 1, low: 2 };
  flags.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const reviewerCounts = assignments.reduce(
    (map, a) => map.set(a.reviewerId, (map.get(a.reviewerId) || 0) + 1),
    new Map(),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      assignments: assignments.length,
      distinctReviewers: reviewerCounts.size,
      decided: assignments.filter((a) => ['approved', 'rejected'].includes(a.status)).length,
      // Assignments whose timings the platform observed directly; only these
      // can be judged on decision speed.
      timedAssignments: assignments.filter((a) => a.assignmentSeed).length,
      flagged: flags.length,
      byType: flags.reduce((counts, f) => {
        counts[f.type] = (counts[f.type] || 0) + 1;
        return counts;
      }, {}),
    },
    // The assignment distribution the evaluation plan calls for auditing.
    reviewerLoad: [...reviewerCounts.entries()]
      .map(([reviewerId, count]) => ({
        reviewerId,
        reviewerName: assignments.find((a) => a.reviewerId === reviewerId)?.reviewer?.name,
        assignments: count,
        share: Number((count / assignments.length).toFixed(3)),
      }))
      .sort((a, b) => b.assignments - a.assignments),
    flags,
  };
};

exports.RUBBER_STAMP_SECONDS = RUBBER_STAMP_SECONDS;
exports.SIGMA_THRESHOLD = SIGMA_THRESHOLD;
