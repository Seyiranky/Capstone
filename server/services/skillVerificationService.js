const crypto = require('crypto');
const { Op, fn, col } = require('sequelize');
const {
  User,
  SkillTask,
  SkillTaskAssignment,
  UserSkill,
  Match,
  Gig,
} = require('../models');

const DAY_MS = 1000 * 60 * 60 * 24;

// Anti-collusion constraints. These are the mechanism RQ1 tests, so each one is
// recorded per assignment rather than applied silently.
const RECENT_TASKS_EXCLUDED = 3; // Cannot review this worker's last N tasks.
const MAX_PAIRINGS_PER_WINDOW = 2;
const PAIRING_WINDOW_DAYS = 90;

// Peer reviewers are drawn from workers who are themselves verified and well
// rated; below this they lack the standing to certify someone else.
const PEER_MIN_TRUST_SCORE = 3.5;

// A track record is required separately from the score. With shrinkage toward
// a 3.5 prior, an unreviewed worker can clear the floor on the prior alone —
// which would mean qualifying to judge others through an absence of evidence
// rather than a record of good work.
const PEER_MIN_REVIEWS = 2;

/**
 * Deterministic draw from a seed.
 *
 * A bare Math.random() leaves no way to show an assignment was not steered.
 * Recording the seed makes every draw replayable by an auditor.
 */
const seededPick = (items, seed) => {
  const digest = crypto.createHash('sha256').update(seed).digest();
  const index = digest.readUInt32BE(0) % items.length;
  return items[index];
};

/** Reviewers this worker has been paired with too recently or too often. */
const overusedReviewers = async (workerId) => {
  const recentTasks = await SkillTask.findAll({
    where: { workerId },
    order: [['createdAt', 'DESC']],
    limit: RECENT_TASKS_EXCLUDED,
    attributes: ['id'],
  });

  const windowStart = new Date(Date.now() - PAIRING_WINDOW_DAYS * DAY_MS);
  const historicTasks = await SkillTask.findAll({
    where: { workerId, createdAt: { [Op.gte]: windowStart } },
    attributes: ['id'],
  });

  const [recentAssignments, windowAssignments] = await Promise.all([
    recentTasks.length
      ? SkillTaskAssignment.findAll({
          where: { taskId: { [Op.in]: recentTasks.map((t) => t.id) } },
          attributes: ['reviewerId'],
        })
      : [],
    historicTasks.length
      ? SkillTaskAssignment.findAll({
          where: { taskId: { [Op.in]: historicTasks.map((t) => t.id) } },
          attributes: ['reviewerId'],
        })
      : [],
  ]);

  const recent = new Set(recentAssignments.map((a) => a.reviewerId));

  const counts = windowAssignments.reduce(
    (map, a) => map.set(a.reviewerId, (map.get(a.reviewerId) || 0) + 1),
    new Map(),
  );
  const overused = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= MAX_PAIRINGS_PER_WINDOW)
      .map(([reviewerId]) => reviewerId),
  );

  return { recent, overused };
};

/**
 * Reviewers who have worked with this worker on a gig.
 *
 * A prior commercial relationship is exactly the channel through which
 * reciprocal approval would flow, so it disqualifies a reviewer.
 */
const pastCollaborators = async (workerId) => {
  const asWorker = await Match.findAll({
    where: { workerId },
    include: [{ model: Gig, as: 'gig', attributes: ['clientId'] }],
    attributes: ['id'],
  });
  const clientIds = asWorker.map((m) => m.gig?.clientId).filter(Boolean);

  const theirGigs = await Gig.findAll({ where: { clientId: workerId }, attributes: ['id'] });
  const workersTheyHired = theirGigs.length
    ? await Match.findAll({
        where: { gigId: { [Op.in]: theirGigs.map((g) => g.id) } },
        attributes: ['workerId'],
      })
    : [];

  return new Set([...clientIds, ...workersTheyHired.map((m) => m.workerId)]);
};

/** Peer reviewers must be verified in the category they are judging. */
const categoryCompetentPeers = async (peerIds, skillId) => {
  if (peerIds.length === 0) return new Set();
  const rows = await UserSkill.findAll({
    where: { userId: { [Op.in]: peerIds }, skillId, verificationStatus: 'verified' },
    attributes: ['userId'],
  });
  return new Set(rows.map((r) => r.userId));
};

const pendingLoads = async () => {
  const rows = await SkillTaskAssignment.findAll({
    attributes: ['reviewerId', [fn('COUNT', col('id')), 'pendingCount']],
    where: { status: 'pending' },
    group: ['reviewerId'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.reviewerId, Number(r.pendingCount)]));
};

/**
 * Picks a reviewer for a skill task under the anti-collusion constraints.
 *
 * Returns the reviewer plus the audit trail behind the choice: which
 * constraints removed whom, how large the eligible pool was, and the seed used
 * for the final draw. `exclude` is used when reassigning after an appeal, so no
 * prior reviewer can see the task again.
 */
exports.assignReviewer = async (
  workerId,
  skillId,
  { exclude = [], reason = 'initial', relaxPairingLimit = false } = {},
) => {
  const candidates = await User.findAll({
    where: { reviewerTier: { [Op.not]: null }, status: 'active' },
    attributes: ['id', 'name', 'reviewerTier', 'trustScore', 'role'],
  });

  const [{ recent, overused }, collaborators] = await Promise.all([
    overusedReviewers(workerId),
    pastCollaborators(workerId),
  ]);

  const peerIds = candidates.filter((c) => c.reviewerTier === 'peer').map((c) => c.id);
  const competentPeers = await categoryCompetentPeers(peerIds, skillId);

  const excluded = new Set(exclude);
  const rejections = [];
  const eligible = candidates.filter((candidate) => {
    const reject = (rule) => {
      rejections.push({ reviewerId: candidate.id, rule });
      return false;
    };
    if (candidate.id === workerId) return reject('self');
    if (excluded.has(candidate.id)) return reject('alreadyReviewed');
    if (recent.has(candidate.id)) return reject('recentPairing');
    if (!relaxPairingLimit && overused.has(candidate.id)) return reject('pairingLimit');
    if (collaborators.has(candidate.id)) return reject('priorGigRelationship');
    if (candidate.reviewerTier === 'peer') {
      if (!competentPeers.has(candidate.id)) return reject('notCategoryCompetent');
      if (candidate.trustScore < PEER_MIN_TRUST_SCORE) return reject('peerTrustTooLow');
      if ((candidate.reviewCount ?? 0) < PEER_MIN_REVIEWS) return reject('peerNoTrackRecord');
    }
    return true;
  });

  const audit = {
    reason,
    relaxPairingLimit,
    poolSize: candidates.length,
    eligibleCount: eligible.length,
    rejections,
  };

  if (eligible.length === 0) {
    return { reviewer: null, audit };
  }

  // Level the queue first, then draw at random within the least-loaded tier, so
  // load balancing cannot be used as a cover for steering assignments.
  const loads = await pendingLoads();
  const minLoad = Math.min(...eligible.map((c) => loads.get(c.id) || 0));
  const leastBusy = eligible
    .filter((c) => (loads.get(c.id) || 0) === minLoad)
    .sort((a, b) => a.id.localeCompare(b.id));

  const seed = `${workerId}:${skillId}:${reason}:${crypto.randomUUID()}`;
  const reviewer = seededPick(leastBusy, seed);

  return {
    reviewer,
    audit: { ...audit, minPendingLoad: minLoad, tiedCount: leastBusy.length, seed },
  };
};

/**
 * How many independent approvals a submission needs.
 *
 * Quorum is reserved for the cases where a single approval is least
 * trustworthy: a worker with nothing verified yet, one with a prior rejection,
 * or a reviewer who says outright they are unsure.
 */
exports.requiredApprovalsFor = async (workerId) => {
  const [verifiedCount, priorRejection] = await Promise.all([
    UserSkill.count({ where: { userId: workerId, verificationStatus: 'verified' } }),
    SkillTask.count({ where: { workerId, status: 'rejected' } }),
  ]);

  const needsQuorum = verifiedCount === 0 || priorRejection > 0;
  return {
    requiredApprovals: needsQuorum ? 2 : 1,
    rationale: needsQuorum
      ? verifiedCount === 0
        ? 'firstVerification'
        : 'priorRejection'
      : 'establishedWorker',
  };
};

exports.LOW_CONFIDENCE_THRESHOLD = 3;
exports.PEER_MIN_TRUST_SCORE = PEER_MIN_TRUST_SCORE;
exports.PEER_MIN_REVIEWS = PEER_MIN_REVIEWS;
exports.RECENT_TASKS_EXCLUDED = RECENT_TASKS_EXCLUDED;
exports.MAX_PAIRINGS_PER_WINDOW = MAX_PAIRINGS_PER_WINDOW;
exports.PAIRING_WINDOW_DAYS = PAIRING_WINDOW_DAYS;
