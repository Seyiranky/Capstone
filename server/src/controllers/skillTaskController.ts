import fs from 'fs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Includeable, WhereOptions } from 'sequelize';
import type { Request, Response } from 'express';
import {
  SkillTask,
  SkillTaskAssignment,
  SkillTaskAppeal,
  SkillTaskEvidence,
  UserSkill,
  Skill,
  User,
} from '../models';
import { evidenceKindFor, evidenceLimitFor } from '../middleware/upload';
import notify from '../lib/notify';
import * as skillVerificationService from '../services/skillVerificationService';
import type { AssignmentAudit } from '../services/skillVerificationService';
import * as trustScoreService from '../services/trustScoreService';
import * as competenceService from '../services/competenceService';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import type { EvidenceKind, SkillTaskKind, SkillTaskStatus } from '../types/domain';
import type { SkillTaskClaim } from '../models/SkillTask';

const TASK_INCLUDES: Includeable[] = [
  { model: Skill, as: 'skill' },
  { model: User, as: 'worker' },
  { model: User, as: 'reviewer' },
  {
    model: SkillTaskAssignment,
    as: 'assignments',
    include: [{ model: User, as: 'reviewer', attributes: ['id', 'name', 'reviewerTier'] }],
  },
  { model: SkillTaskAppeal, as: 'appeal' },
  { model: SkillTaskEvidence, as: 'evidence' },
];

/** A task with the associations these handlers reach for. */
type LoadedTask = SkillTask & {
  skill?: Skill | null;
  assignments?: SkillTaskAssignment[];
  appeal?: SkillTaskAppeal | null;
};

const EVIDENCE_KINDS: EvidenceKind[] = ['photo', 'video', 'voice', 'link', 'document'];

interface OpenRoundInput {
  task: SkillTask;
  skill: Skill | null | undefined;
  round: number;
  exclude?: string[];
  reason: string;
  relaxPairingLimit?: boolean;
}

/** Creates an assignment round and notifies the chosen reviewer. */
const openRound = async (
  req: Request,
  { task, skill, round, exclude, reason, relaxPairingLimit }: OpenRoundInput,
): Promise<{ reviewer: User | null; audit: AssignmentAudit; assignment?: SkillTaskAssignment }> => {
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
    assignmentSeed: audit.seed ?? null,
    eligiblePoolSize: audit.eligibleCount,
    assignedAt: new Date(),
  });

  const worker = await User.findByPk(task.workerId, { attributes: ['name'] });
  await notify(req, {
    userId: reviewer.id,
    title: 'New skill verification request',
    body: `${worker?.name} submitted evidence for ${skill?.name} and needs your review.`,
  });

  return { reviewer, audit, assignment };
};

export const submitTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { skillId, evidenceUrl, notes, kind = 'demonstration' } = req.body ?? {};
  const files = (req.files as Express.Multer.File[] | undefined) || [];

  if (!skillId) {
    res.status(400).json({ message: 'skillId is required' });
    return;
  }
  if (!['demonstration', 'certificate'].includes(kind)) {
    res.status(400).json({ message: "kind must be 'demonstration' or 'certificate'" });
    return;
  }

  // What the worker says the document is. A reviewer sights it; nobody
  // authenticates the award behind it, and the UI must not imply otherwise.
  let claim: SkillTaskClaim | null = null;
  if (kind === 'certificate') {
    const { title, issuer, issuedOn } = req.body ?? {};
    if (!title || !issuer) {
      res.status(400).json({ message: 'A certificate needs at least a title and an issuer' });
      return;
    }
    claim = { title, issuer, issuedOn: issuedOn || null };
  }
  // A pasted link is still accepted, but it is no longer the only way in: a
  // photo of finished work or a spoken description is far more reachable for
  // the workers this is built for.
  if (!evidenceUrl && files.length === 0) {
    res.status(400).json({ message: 'Attach a photo, video or voice note, or provide a link' });
    return;
  }

  const oversized = files.find((file) => file.size > evidenceLimitFor(file.mimetype));
  if (oversized) {
    fs.unlinkSync(oversized.path);
    res.status(413).json({
      message: `${oversized.mimetype} evidence may be at most ${Math.round(
        evidenceLimitFor(oversized.mimetype) / (1024 * 1024),
      )}MB`,
    });
    return;
  }

  const skill = await Skill.findByPk(skillId);
  if (!skill) {
    res.status(404).json({ message: 'Skill not found' });
    return;
  }

  const { requiredApprovals, rationale } = await skillVerificationService.requiredApprovalsFor(
    caller.id,
  );

  const task = await SkillTask.create({
    workerId: caller.id,
    skillId,
    // Kept populated with the first artifact so existing consumers of the
    // single-link field keep working; SkillTaskEvidences is authoritative.
    evidenceUrl: evidenceUrl || `/uploads/evidence/${files[0].filename}`,
    notes,
    kind: kind as SkillTaskKind,
    claim,
    status: 'pending',
    requiredApprovals,
  });

  // A photograph of a certificate and a photograph of finished work have the
  // same mime type, so the client says which it is and the server trusts that
  // over sniffing.
  const declaredKinds = ([] as unknown[])
    .concat(req.body?.evidenceKind ?? [])
    .filter((k): k is EvidenceKind => EVIDENCE_KINDS.includes(k as EvidenceKind));

  const evidenceRows = [
    ...(evidenceUrl
      ? [{ taskId: task.id, kind: 'link' as EvidenceKind, url: evidenceUrl }]
      : []),
    ...files.map((file, index) => ({
      taskId: task.id,
      kind: (declaredKinds[index] ||
        (kind === 'certificate' ? 'document' : evidenceKindFor(file.mimetype))) as EvidenceKind,
      url: `/uploads/evidence/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      // Ties a reviewer's decision to the exact bytes they saw.
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex'),
      capturedAt: new Date(),
    })),
  ];
  await SkillTaskEvidence.bulkCreate(evidenceRows);

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
    res.status(201).json({
      ...task.toJSON(),
      quorumRationale: rationale,
      awaitingReviewer: true,
      assignmentAudit: audit,
    });
    return;
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
export const assignTask = async (req: Request, res: Response): Promise<void> => {
  const relax = stringParam(req, 'relax') === 'true';

  const task = (await SkillTask.findByPk(pathParam(req, 'id'), {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
    ],
  })) as LoadedTask | null;
  if (!task) {
    res.status(404).json({ message: 'Skill task not found' });
    return;
  }
  if (task.status !== 'pending') {
    res.status(409).json({ message: 'This task is not awaiting review' });
    return;
  }
  const assignments = task.assignments ?? [];
  if (assignments.some((a) => a.status === 'pending')) {
    res.status(409).json({ message: 'This task already has an open assignment' });
    return;
  }

  const priorReviewers = assignments.map((a) => a.reviewerId);
  const round = assignments.length ? Math.max(...assignments.map((a) => a.round)) + 1 : 1;

  const { reviewer, audit } = await openRound(req, {
    task,
    skill: task.skill,
    round,
    exclude: priorReviewers,
    reason: relax ? 'manual-relaxed' : 'manual',
    relaxPairingLimit: relax,
  });

  if (!reviewer) {
    res.status(409).json({
      message: relax
        ? 'No reviewer is eligible even with the pairing limit relaxed'
        : 'No reviewer is eligible; retry with relax=true to drop the pairing limit',
      audit,
    });
    return;
  }

  await task.update({ reviewerId: reviewer.id });
  const updated = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
  res.json(updated);
};

/**
 * Closes a submission: marks it approved or rejected, and on approval makes
 * the skill verified at the level the reviewer judged, then recalculates trust
 * and competence and tells the worker. Shared by peer review and an admin's decision.
 */
const settleTask = async (req: Request, task: LoadedTask, finalStatus: SkillTaskStatus, proficiencyLevel?: number) => {
  await task.update({ status: finalStatus, reviewedAt: new Date() });

  if (finalStatus === 'approved') {
    const [userSkill] = await UserSkill.findOrCreate({
      where: { userId: task.workerId, skillId: task.skillId },
      defaults: {
        userId: task.workerId,
        skillId: task.skillId,
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
    // Provenance moves with the kind of evidence approved: a sighted
    // certificate and an approved demonstration are not the same claim.
    await competenceService.recalculate(task.workerId, task.skillId, {
      trigger: `task:${task.kind}:approved`,
    });
  }

  await notify(req, {
    userId: task.workerId,
    title: finalStatus === 'approved' ? 'Skill verified' : 'Skill submission rejected',
    body:
      finalStatus === 'approved'
        ? `Your submission for ${task.skill?.name} was approved. It now shows as a verified skill.`
        : `Your submission for ${task.skill?.name} was rejected. You can appeal or submit new evidence.`,
    // The verdict on evidence the worker submitted, often days earlier --
    // the wait is exactly why this should not need the app to be open.
    category: 'outcome',
  });
};


export const reviewTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { decision, notes, confidence, proficiencyLevel } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  if (confidence !== undefined && ![1, 2, 3, 4, 5].includes(confidence)) {
    res.status(400).json({ message: 'confidence must be an integer from 1 to 5' });
    return;
  }
  if (proficiencyLevel !== undefined && ![1, 2, 3, 4, 5].includes(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }

  const task = (await SkillTask.findByPk(pathParam(req, 'id'), {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
    ],
  })) as LoadedTask | null;
  if (!task) {
    res.status(404).json({ message: 'Skill task not found' });
    return;
  }
  if (task.status !== 'pending') {
    res.status(409).json({ message: 'This task has already been reviewed' });
    return;
  }

  const assignments = task.assignments ?? [];
  const mine = assignments.find((a) => a.reviewerId === caller.id && a.status === 'pending');
  if (!mine) {
    res.status(403).json({ message: 'You do not have an open assignment for this task' });
    return;
  }

  await mine.update({
    status: decision,
    notes: notes ?? mine.notes,
    confidence: confidence ?? mine.confidence,
    decidedAt: new Date(),
  });

  const decisions = assignments
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

  const reviewedBy = assignments.map((a) => a.reviewerId);
  const roundsUsed = Math.max(...assignments.map((a) => a.round));

  const settle = (finalStatus: SkillTaskStatus) => settleTask(req, task, finalStatus, proficiencyLevel);

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

/**
 * An admin decides a submission directly, whoever it is assigned to.
 *
 * Peer review is the normal path; this is for an admin who has looked at the
 * evidence and needs to settle it (a reviewer is away, or the queue is stuck).
 * It is recorded as the admin's own review, with no draw behind it, and any
 * peer still assigned is released and told, so the record shows who decided.
 */
export const adminDecide = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { decision, notes, proficiencyLevel } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  if (proficiencyLevel !== undefined && ![1, 2, 3, 4, 5].includes(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }
  const task = (await SkillTask.findByPk(pathParam(req, 'id'), {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
    ],
  })) as LoadedTask | null;
  if (!task) {
    res.status(404).json({ message: 'Skill task not found' });
    return;
  }
  if (task.status !== 'pending') {
    res.status(409).json({ message: 'This task has already been reviewed' });
    return;
  }

  const assignments = task.assignments ?? [];
  const now = new Date();
  for (const open of assignments.filter((a) => a.status === 'pending' && a.reviewerId !== caller.id)) {
    await open.update({ status: 'expired', notes: 'Closed: an admin decided this submission', decidedAt: now });
    await notify(req, {
      userId: open.reviewerId,
      title: 'Review no longer needed',
      body: `An admin decided the ${task.skill?.name ?? 'skill'} submission you were asked to review. Thank you.`,
    });
  }
  const mine = assignments.find((a) => a.status === 'pending' && a.reviewerId === caller.id);
  const text = typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 1000) : null;
  if (mine) {
    await mine.update({ status: decision, notes: text ?? mine.notes, decidedAt: now });
  } else {
    await SkillTaskAssignment.create({
      taskId: task.id,
      reviewerId: caller.id,
      round: assignments.length ? Math.max(...assignments.map((a) => a.round)) + 1 : 1,
      status: decision,
      notes: text ? `Admin decision: ${text}` : 'Admin decision',
      confidence: null,
      // No draw: the admin chose to decide, so there is no seed or pool to audit.
      assignmentSeed: null,
      eligiblePoolSize: null,
      assignedAt: now,
      decidedAt: now,
    });
  }
  await settleTask(req, task, decision, proficiencyLevel);
  res.json(await SkillTask.findByPk(task.id, { include: TASK_INCLUDES }));
};

export const listTasks = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const assignedToMe = stringParam(req, 'assignedToMe') === 'true';
  let where: WhereOptions<SkillTask>;
  if (caller.role === 'admin' && !assignedToMe) {
    where = {};
  } else if (caller.reviewerTier && assignedToMe) {
    const assignments = await SkillTaskAssignment.findAll({
      where: { reviewerId: caller.id, status: 'pending' },
      attributes: ['taskId'],
    });
    where = { id: { [Op.in]: assignments.map((a) => a.taskId) } };
  } else {
    where = { workerId: caller.id };
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
export const appealTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { reason } = req.body ?? {};
  if (!reason || !reason.trim()) {
    res.status(400).json({ message: 'reason is required to appeal' });
    return;
  }

  const task = (await SkillTask.findByPk(pathParam(req, 'id'), {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
      { model: SkillTaskAppeal, as: 'appeal' },
    ],
  })) as LoadedTask | null;
  if (!task) {
    res.status(404).json({ message: 'Skill task not found' });
    return;
  }
  if (task.workerId !== caller.id) {
    res.status(403).json({ message: 'Only the submitting worker may appeal' });
    return;
  }
  if (task.status !== 'rejected') {
    res.status(409).json({ message: 'Only a rejected submission can be appealed' });
    return;
  }
  if (task.appeal) {
    res.status(409).json({ message: 'This submission has already been appealed' });
    return;
  }

  const appeal = await SkillTaskAppeal.create({
    taskId: task.id,
    workerId: caller.id,
    reason: reason.trim(),
    status: 'open',
  });

  const assignments = task.assignments ?? [];
  const priorReviewers = assignments.map((a) => a.reviewerId);
  const roundsUsed = Math.max(...assignments.map((a) => a.round));
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
          body: `An appealed ${task.skill?.name} submission has no eligible reviewer outside the original pairing.`,
        }),
      ),
    );
    const pending = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
    res.status(201).json({ appeal, task: pending, awaitingReviewer: true, audit });
    return;
  }

  const updated = await SkillTask.findByPk(task.id, { include: TASK_INCLUDES });
  res.status(201).json({ appeal, task: updated });
};

/**
 * Records a skill the worker says they have.
 *
 * The weakest tier by design, and labelled as such everywhere it appears. It
 * exists because registration captured no competence at all: a worker arrived
 * with nothing on their profile and could not be matched to anything until a
 * review completed, which in a short pilot means most people are invisible for
 * most of it.
 */
export const declareSkill = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { skillId, proficiencyLevel } = req.body ?? {};
  if (!skillId) {
    res.status(400).json({ message: 'skillId is required' });
    return;
  }
  if (proficiencyLevel !== undefined && ![1, 2, 3, 4, 5].includes(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }

  const skill = await Skill.findByPk(skillId);
  if (!skill) {
    res.status(404).json({ message: 'Skill not found' });
    return;
  }

  const [userSkill, created] = await UserSkill.findOrCreate({
    where: { userId: caller.id, skillId },
    defaults: {
      userId: caller.id,
      skillId,
      proficiencyLevel: proficiencyLevel ?? 1,
      verificationStatus: 'unverified',
      provenance: 'self_declared',
      credentialStrength: competenceService.TIERS.self_declared,
      selfDeclaredAt: new Date(),
    },
  });

  // Declaring again must never undo verification a reviewer granted.
  if (!created && userSkill.verificationStatus === 'unverified') {
    await userSkill.update({
      proficiencyLevel: proficiencyLevel ?? userSkill.proficiencyLevel,
      selfDeclaredAt: userSkill.selfDeclaredAt ?? new Date(),
    });
  }

  const fresh = await UserSkill.findByPk(userSkill.id, {
    include: [{ model: Skill, as: 'skill' }],
  });
  res.status(created ? 201 : 200).json(fresh);
};

/** Every skill the signed-in worker holds, declared or verified. */
export const listMySkills = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const skills = await UserSkill.findAll({
    where: { userId: caller.id },
    include: [{ model: Skill, as: 'skill' }],
    order: [['createdAt', 'ASC']],
  });
  res.json(skills);
};
