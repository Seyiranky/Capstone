import { SkillTask, SkillTaskAssignment, User, Match, Gig } from '../models';

// A decision this fast cannot involve examining the evidence.
const RUBBER_STAMP_SECONDS = 60;

// Flag at two standard deviations: conventional, and it keeps the report short
// enough to actually be triaged in a pilot of this size.
const SIGMA_THRESHOLD = 2;

const MIN_REVIEWS_FOR_RATE_COMPARISON = 5;

/** What a flag is alleging. A flag is a prompt to look, never a finding. */
export type CollusionFlagType =
  | 'repeatedPairing'
  | 'approvesEverything'
  | 'rejectsEverything'
  | 'rubberStamped'
  | 'priorGigRelationship';

export type Severity = 'high' | 'medium' | 'low';

export interface CollusionFlag {
  type: CollusionFlagType;
  severity: Severity;
  taskId?: string;
  workerId?: string;
  workerName?: string;
  reviewerId: string;
  reviewerName?: string;
  evidence: Record<string, unknown>;
}

/** An assignment with the task, worker and reviewer eagerly loaded. */
type LoadedAssignment = SkillTaskAssignment & {
  task?: (SkillTask & { worker?: User }) | null;
  reviewer?: User | null;
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

const stdDev = (values: number[]): number => {
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
const binomialExpectation = (
  taskCount: number,
  poolSize: number | null,
): { expected: number; sd: number } | null => {
  if (!poolSize || poolSize < 2) return null;
  const p = 1 / poolSize;
  return { expected: taskCount * p, sd: Math.sqrt(taskCount * p * (1 - p)) };
};

/** Worker–reviewer pairs that recur more often than chance would produce. */
const pairCoOccurrence = (assignments: LoadedAssignment[]): CollusionFlag[] => {
  const byWorker = new Map<string, LoadedAssignment[]>();
  for (const a of assignments) {
    const workerId = a.task?.workerId;
    if (!workerId) continue;
    if (!byWorker.has(workerId)) byWorker.set(workerId, []);
    (byWorker.get(workerId) as LoadedAssignment[]).push(a);
  }

  const flags: CollusionFlag[] = [];
  for (const [workerId, workerAssignments] of byWorker) {
    const taskCount = new Set(workerAssignments.map((a) => a.taskId)).size;
    if (taskCount < 3) continue;

    const poolSizes = workerAssignments
      .map((a) => a.eligiblePoolSize)
      .filter(Boolean) as number[];
    const poolSize = poolSizes.length ? Math.round(mean(poolSizes)) : null;
    const stats = binomialExpectation(taskCount, poolSize);
    if (!stats || stats.sd === 0) continue;

    const counts = workerAssignments.reduce(
      (map, a) => map.set(a.reviewerId, (map.get(a.reviewerId) || 0) + 1),
      new Map<string, number>(),
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
const approvalRateOutliers = (assignments: LoadedAssignment[]): CollusionFlag[] => {
  const decided = assignments.filter((a) => ['approved', 'rejected'].includes(a.status));
  const byReviewer = decided.reduce((map, a) => {
    if (!map.has(a.reviewerId)) map.set(a.reviewerId, []);
    (map.get(a.reviewerId) as LoadedAssignment[]).push(a);
    return map;
  }, new Map<string, LoadedAssignment[]>());

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
      type: (r.rate > peerMean ? 'approvesEverything' : 'rejectsEverything') as CollusionFlagType,
      severity: 'medium' as Severity,
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
const rubberStamps = (assignments: LoadedAssignment[]): CollusionFlag[] =>
  assignments
    .filter((a) => a.decidedAt && a.assignedAt && a.status === 'approved' && a.assignmentSeed)
    .map((a) => ({
      a,
      seconds: ((a.decidedAt as Date).getTime() - a.assignedAt.getTime()) / 1000,
    }))
    .filter(({ seconds }) => seconds >= 0 && seconds < RUBBER_STAMP_SECONDS)
    .map(({ a, seconds }) => ({
      type: 'rubberStamped' as CollusionFlagType,
      severity: 'high' as Severity,
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
const priorRelationships = async (
  assignments: LoadedAssignment[],
): Promise<CollusionFlag[]> => {
  const workerIds = [
    ...new Set(assignments.map((a) => a.task?.workerId).filter(Boolean)),
  ] as string[];
  if (workerIds.length === 0) return [];

  const matches = await Match.findAll({
    where: { workerId: workerIds },
    include: [{ model: Gig, as: 'gig', attributes: ['clientId'] }],
    attributes: ['workerId'],
  });

  const pairs = new Set(
    matches.filter((m) => m.gig?.clientId).map((m) => `${m.workerId}:${m.gig?.clientId}`),
  );

  return assignments
    .filter(
      (a) =>
        a.task?.workerId &&
        ['approved', 'rejected'].includes(a.status) &&
        pairs.has(`${a.task.workerId}:${a.reviewerId}`),
    )
    .map((a) => ({
      type: 'priorGigRelationship' as CollusionFlagType,
      severity: 'high' as Severity,
      taskId: a.taskId,
      workerId: a.task?.workerId,
      workerName: a.task?.worker?.name,
      reviewerId: a.reviewerId,
      reviewerName: a.reviewer?.name,
      evidence: { relationship: 'worked together on a gig', decision: a.status },
    }));
};

export interface CollusionReport {
  generatedAt: string;
  summary: {
    assignments: number;
    distinctReviewers: number;
    decided: number;
    timedAssignments: number;
    flagged: number;
    byType: Record<string, number>;
    /** Reviewers stepping aside: a disclosed relationship or conflict, or
     *  not feeling qualified. Disclosures are the FR-5 record RQ1 reads. */
    recusals: { total: number; byReason: Record<string, number> };
  };
  reviewerLoad: {
    reviewerId: string;
    reviewerName?: string;
    assignments: number;
    share: number;
  }[];
  flags: CollusionFlag[];
}

/**
 * Audits reviewer assignment for signs of worker–reviewer collusion (RQ1).
 *
 * Every flag carries the numbers behind it so an assessor can judge the claim
 * rather than trust the label. A flag is a prompt to look, not a finding of
 * misconduct.
 */
export const report = async (): Promise<CollusionReport> => {
  const assignments = (await SkillTaskAssignment.findAll({
    include: [
      {
        model: SkillTask,
        as: 'task',
        include: [{ model: User, as: 'worker', attributes: ['id', 'name'] }],
      },
      { model: User, as: 'reviewer', attributes: ['id', 'name', 'reviewerTier'] },
    ],
  })) as LoadedAssignment[];

  const [relationshipFlags] = await Promise.all([priorRelationships(assignments)]);

  const flags = [
    ...rubberStamps(assignments),
    ...relationshipFlags,
    ...pairCoOccurrence(assignments),
    ...approvalRateOutliers(assignments),
  ];

  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  flags.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const reviewerCounts = assignments.reduce(
    (map, a) => map.set(a.reviewerId, (map.get(a.reviewerId) || 0) + 1),
    new Map<string, number>(),
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
      byType: flags.reduce<Record<string, number>>((counts, f) => {
        counts[f.type] = (counts[f.type] || 0) + 1;
        return counts;
      }, {}),
      recusals: {
        total: assignments.filter((a) => a.status === 'recused').length,
        byReason: assignments
          .filter((a) => a.status === 'recused' && a.recusalReason)
          .reduce<Record<string, number>>((counts, a) => {
            const key = a.recusalReason as string;
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {}),
      },
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

export { RUBBER_STAMP_SECONDS, SIGMA_THRESHOLD };
