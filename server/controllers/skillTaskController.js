const { Op } = require('sequelize');
const {
  SkillTask,
  SkillTaskAssignment,
  SkillTaskAppeal,
  UserSkill,
  Skill,
  User,
} = require('../models');
const notify = require('../lib/notify');
const skillVerificationService = require('../services/skillVerificationService');
const trustScoreService = require('../services/trustScoreService');

const TASK_INCLUDES = [
  { model: Skill, as: 'skill' },
  { model: User, as: 'worker' },
  { model: User, as: 'reviewer' },
  {
    model: SkillTaskAssignment,
    as: 'assignments',
    include: [{ model: User, as: 'reviewer', attributes: ['id', 'name', 'reviewerTier'] }],
  },
  { model: SkillTaskAppeal, as: 'appeal' },
];

/** Creates an assignment round and notifies the chosen reviewer. */
const openRound = async (req, { task, skill, round, exclude, reason, relaxPairingLimit }) => {
  const { reviewer, audit } = await skillVerificationService.assignReviewer(
    task.workerId,
    task.skillId,
    { exclude, reason, relaxPairingLimit },
  );
  if (!reviewer) return { reviewer: null, audit };

  const assignment = await SkillTaskAssignment.create({
    taskId: task.id,
    reviewerId: reviewer.id,
    round,
    status: 'pending',
    assignmentSeed: audit.seed,
    eligiblePoolSize: audit.eligibleCount,
    assignedAt: new Date(),
  });

  const worker = await User.findByPk(task.workerId, { attributes: ['name'] });
  await notify(req, {
    userId: reviewer.id,
    title: 'New skill verification request',
    body: `${worker.name} submitted evidence for ${skill.name} and needs your review.`,
  });

  return { reviewer, audit, assignment };
};

exports.submitTask = async (req, res) => {
  const { skillId, evidenceUrl, notes } = req.body;
  if (!skillId || !evidenceUrl) {
    return res.status(400).json({ message: 'skillId and evidenceUrl are required' });
  }

  const skill = await Skill.findByPk(skillId);
  if (!skill) {
    return res.status(404).json({ message: 'Skill not found' });
  }

  const { requiredApprovals, rationale } =
    await skillVerificationService.requiredApprovalsFor(req.user.id);

  const task = await SkillTask.create({
    workerId: req.user.id,
    skillId,
    evidenceUrl,
    notes,
    status: 'pending',
    requiredApprovals,
  });

  const { reviewer, audit } = await openRound(req, { task, skill, round: 1, reason: 'initial' });

  if (!reviewer) {
    // The submission is kept, not discarded. In a pool this small the rotation
    // rules will sometimes leave nobody eligible, and throwing away a worker's
    // evidence is a worse outcome than queueing it for an admin to place.
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    await Promise.all(
      admins.map((admin) =>
        notify(req, {
          userId: admin.id,
          title: 'Skill submission needs manual assignment',
          body: `No reviewer was eligible for a ${skill.name} submission. Assign one from the review queue.`,
        }),
      ),
    );
    return res.status(201).json({
      ...task.toJSON(),
      quorumRationale: rationale,
      awaitingReviewer: true,
      assignmentAudit: audit,
    });
  }

  // Mirrored onto the task for backwards compatibility; SkillTaskAssignments is
  // the authoritative per-round record.
  await task.update({ reviewerId: reviewer.id });

  res.status(201).json({ ...task.toJSON(), quorumRationale: rationale });
};

/**
 * Retries assignment for a task nobody was eligible to review.
 *
 * `relax` drops the repeat-pairing limit, which is sometimes the only way to
 * place a task in a small pool. It is recorded on the assignment as
 * 'manual-relaxed' precisely so the RQ1 audit can separate constrained
 * assignments from ones a human had to force.
 */
exports.assignTask = async (req, res) => {
  const relax = req.query.relax === 'true';

  const task = await SkillTask.findByPk(req.params.id, {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
    ],
  });
  if (!task) {
    return res.status(404).json({ message: 'Skill task not found' });
  }
  if (task.status !== 'pending') {
    return res.status(409).json({ message: 'This task is not awaiting review' });
  }
  if (task.assignments.some((a) => a.status === 'pending')) {
    return res.status(409).json({ message: 'This task already has an open assignment' });
  }

  const priorReviewers = task.assignments.map((a) => a.reviewerId);
  const round = task.assignments.length ? Math.max(...task.assignments.map((a) => a.round)) + 1 : 1;

  const { reviewer, audit } = await openRound(req, {
    task,
    skill: task.skill,
    round,
    exclude: priorReviewers,
    reason: relax ? 'manual-relaxed' : 'manual',
    relaxPairingLimit: relax,
  });

  if (!reviewer) {
    return res.status(409).json({
      message: relax
        ? 'No reviewer is eligible even with the pairing limit relaxed'
        : 'No reviewer is eligible; retry with relax=true to drop the pairing limit',
      audit,
    });
  }

  await task.update({ reviewerId: reviewer.id });
  const updated = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
  res.json(updated);
};

exports.reviewTask = async (req, res) => {
  const { decision, notes, confidence, proficiencyLevel } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
  }
  if (confidence !== undefined && ![1, 2, 3, 4, 5].includes(confidence)) {
    return res.status(400).json({ message: 'confidence must be an integer from 1 to 5' });
  }
  if (
    proficiencyLevel !== undefined &&
    ![1, 2, 3, 4, 5].includes(proficiencyLevel)
  ) {
    return res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
  }

  const task = await SkillTask.findByPk(req.params.id, {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
    ],
  });
  if (!task) {
    return res.status(404).json({ message: 'Skill task not found' });
  }
  if (task.status !== 'pending') {
    return res.status(409).json({ message: 'This task has already been reviewed' });
  }

  const mine = task.assignments.find(
    (a) => a.reviewerId === req.user.id && a.status === 'pending',
  );
  if (!mine) {
    return res.status(403).json({ message: 'You do not have an open assignment for this task' });
  }

  await mine.update({
    status: decision,
    notes: notes ?? mine.notes,
    confidence: confidence ?? mine.confidence,
    decidedAt: new Date(),
  });

  const decisions = task.assignments
    .filter((a) => ['approved', 'rejected'].includes(a.status) || a.id === mine.id)
    .map((a) => (a.id === mine.id ? decision : a.status));
  const approvals = decisions.filter((d) => d === 'approved').length;
  const rejections = decisions.filter((d) => d === 'rejected').length;

  // A reviewer who says they are unsure should not be the only one to decide.
  const lowConfidence =
    confidence !== undefined && confidence < skillVerificationService.LOW_CONFIDENCE_THRESHOLD;
  let requiredApprovals = task.requiredApprovals;
  if (lowConfidence && requiredApprovals < 2) {
    requiredApprovals = 2;
    await task.update({ requiredApprovals });
  }

  const disagreement = approvals > 0 && rejections > 0;
  if (disagreement && !task.disagreementFlag) {
    await task.update({ disagreementFlag: true });
  }

  const reviewedBy = task.assignments.map((a) => a.reviewerId);
  const roundsUsed = Math.max(...task.assignments.map((a) => a.round));

  const settle = async (finalStatus) => {
    await task.update({ status: finalStatus, reviewedAt: new Date() });

    if (finalStatus === 'approved') {
      const [userSkill] = await UserSkill.findOrCreate({
        where: { userId: task.workerId, skillId: task.skillId },
        defaults: {
          proficiencyLevel: proficiencyLevel ?? 1,
          verificationStatus: 'verified',
        },
      });
      await userSkill.update({
        verificationStatus: 'verified',
        // Previously hardcoded to 1 forever; the reviewer who examined the
        // evidence is the one who can judge the level.
        ...(proficiencyLevel !== undefined ? { proficiencyLevel } : {}),
      });

      await trustScoreService.recalculate(task.workerId, { trigger: 'skill:verified' });
    }

    await notify(req, {
      userId: task.workerId,
      title: finalStatus === 'approved' ? 'Skill verified' : 'Skill submission rejected',
      body:
        finalStatus === 'approved'
          ? `Your submission for ${task.skill.name} was approved. It now shows as a verified skill.`
          : `Your submission for ${task.skill.name} was rejected. You can appeal or submit new evidence.`,
    });
  };

  // Enough agreement to settle, in either direction.
  if (approvals >= requiredApprovals) {
    await settle('approved');
  } else if (rejections >= requiredApprovals && !disagreement) {
    await settle('rejected');
  } else if (disagreement && roundsUsed < 3) {
    // Split decision: bring in one more independent reviewer to break the tie.
    const { reviewer } = await openRound(req, {
      task,
      skill: task.skill,
      round: roundsUsed + 1,
      exclude: reviewedBy,
      reason: 'tiebreak',
    });
    if (!reviewer) {
      await settle(approvals > rejections ? 'approved' : 'rejected');
    }
  } else if (disagreement) {
    // Majority decides once the escalation ceiling is reached.
    await settle(approvals > rejections ? 'approved' : 'rejected');
  } else {
    // Quorum still short and no disagreement: recruit the next approver.
    const { reviewer } = await openRound(req, {
      task,
      skill: task.skill,
      round: roundsUsed + 1,
      exclude: reviewedBy,
      reason: 'quorum',
    });
    if (!reviewer) {
      await settle(approvals > 0 ? 'approved' : 'rejected');
    }
  }

  const updated = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
  res.json(updated);
};

exports.listTasks = async (req, res) => {
  let where;
  if (req.user.role === 'admin' && req.query.assignedToMe !== 'true') {
    where = {};
  } else if (req.user.reviewerTier && req.query.assignedToMe === 'true') {
    const assignments = await SkillTaskAssignment.findAll({
      where: { reviewerId: req.user.id, status: 'pending' },
      attributes: ['taskId'],
    });
    where = { id: { [Op.in]: assignments.map((a) => a.taskId) } };
  } else {
    where = { workerId: req.user.id };
  }

  const tasks = await SkillTask.findAll({
    where,
    include: TASK_INCLUDES,
    order: [['createdAt', 'DESC']],
  });
  res.json(tasks);
};

/**
 * A worker's recourse against a reviewer acting in bad faith.
 *
 * Upholding an appeal reassigns the task while excluding every reviewer who has
 * already seen it, so the same pairing cannot decide twice.
 */
exports.appealTask = async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: 'reason is required to appeal' });
  }

  const task = await SkillTask.findByPk(req.params.id, {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
      { model: SkillTaskAppeal, as: 'appeal' },
    ],
  });
  if (!task) {
    return res.status(404).json({ message: 'Skill task not found' });
  }
  if (task.workerId !== req.user.id) {
    return res.status(403).json({ message: 'Only the submitting worker may appeal' });
  }
  if (task.status !== 'rejected') {
    return res.status(409).json({ message: 'Only a rejected submission can be appealed' });
  }
  if (task.appeal) {
    return res.status(409).json({ message: 'This submission has already been appealed' });
  }

  const appeal = await SkillTaskAppeal.create({
    taskId: task.id,
    workerId: req.user.id,
    reason: reason.trim(),
    status: 'open',
  });

  const priorReviewers = task.assignments.map((a) => a.reviewerId);
  const roundsUsed = Math.max(...task.assignments.map((a) => a.round));
  const { reviewer, audit } = await openRound(req, {
    task,
    skill: task.skill,
    round: roundsUsed + 1,
    exclude: priorReviewers,
    reason: 'appeal',
  });

  // The appeal stands either way; it just waits on an admin to place it when
  // no untainted reviewer is available.
  await task.update({
    status: 'pending',
    reviewedAt: null,
    reviewerId: reviewer ? reviewer.id : null,
  });
  await appeal.update({
    status: 'upheld',
    resolutionNotes: reviewer
      ? 'Reassigned to a new reviewer'
      : 'Upheld; awaiting manual assignment outside the original pairing',
  });

  if (!reviewer) {
    const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
    await Promise.all(
      admins.map((admin) =>
        notify(req, {
          userId: admin.id,
          title: 'Appeal needs manual assignment',
          body: `An appealed ${task.skill.name} submission has no eligible reviewer outside the original pairing.`,
        }),
      ),
    );
    const pending = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
    return res.status(201).json({ appeal, task: pending, awaitingReviewer: true, audit });
  }

  const updated = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
  res.status(201).json({ appeal, task: updated });
};
