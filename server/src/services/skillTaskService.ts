import fs from 'fs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import type { Request } from 'express';
import type { Includeable, WhereOptions } from 'sequelize';
import {
  SkillTask,
  SkillTaskAssignment,
  SkillTaskAppeal,
  SkillTaskEvidence,
  UserSkill,
  Skill,
  User,
} from '../models';
import { evidenceKindFor } from '../middleware/upload';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import * as skillVerificationService from './skillVerificationService';
import type { AssignmentAudit } from './skillVerificationService';
import * as trustScoreService from './trustScoreService';
import * as competenceService from './competenceService';
import type { AuthUser, EvidenceKind, RecusalReason, SkillTaskKind, SkillTaskStatus } from '../types/domain';
import type { SkillTaskClaim } from '../models/SkillTask';

/**
 * A worker's skill submission, from evidence to verdict.
 *
 * The draw itself (who may review whom) is skillVerificationService; this is
 * everything around it: opening a review round, counting decisions toward the
 * quorum, settling, recusal, appeal and an admin's direct decision. Each
 * function throws an HttpError the API answers with, so the controller only
 * reads the request and shapes the response.
 */
type AppContext = Pick<Request, 'app'> | undefined;

export const TASK_INCLUDES: Includeable[] = [
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

/** A task with the associations these functions reach for. */
type LoadedTask = SkillTask & {
  skill?: Skill | null;
  assignments?: SkillTaskAssignment[];
  appeal?: SkillTaskAppeal | null;
};

export const EVIDENCE_KINDS: EvidenceKind[] = ['photo', 'video', 'voice', 'link', 'document'];
export const RECUSAL_REASONS: RecusalReason[] = ['knowsWorker', 'conflict', 'notQualified'];

export type Decision = 'approved' | 'rejected';

const withDetails = (id: string) => SkillTask.findByPk(id, { include: TASK_INCLUDES });

const loadTask = async (id: string, { withAppeal = false } = {}): Promise<LoadedTask> => {
  const task = (await SkillTask.findByPk(id, {
    include: [
      { model: Skill, as: 'skill' },
      { model: SkillTaskAssignment, as: 'assignments' },
      ...(withAppeal ? [{ model: SkillTaskAppeal, as: 'appeal' }] : []),
    ],
  })) as LoadedTask | null;
  if (!task) throw new HttpError('Skill task not found', 404);
  return task;
};

/** A task still waiting on a verdict, and the caller's own open assignment on it. */
const loadOpenAssignment = async (taskId: string, reviewerId: string) => {
  const task = await loadTask(taskId);
  if (task.status !== 'pending') throw new HttpError('This task has already been reviewed', 409);
  const assignments = task.assignments ?? [];
  const mine = assignments.find((a) => a.reviewerId === reviewerId && a.status === 'pending');
  if (!mine) throw new HttpError('You do not have an open assignment for this task', 403);
  return { task, assignments, mine };
};

const nextRound = (assignments: SkillTaskAssignment[]) => Math.max(...assignments.map((a) => a.round)) + 1;

const notifyAdmins = async (ctx: AppContext, title: string, body: string) => {
  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  await Promise.all(admins.map((admin) => notify(ctx, { userId: admin.id, title, body })));
};

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
  ctx: AppContext,
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
  await notify(ctx, {
    userId: reviewer.id,
    title: 'New skill verification request',
    body: `${worker?.name} submitted evidence for ${skill?.name} and needs your review.`,
  });

  return { reviewer, audit, assignment };
};

/** An uploaded evidence file, as multer leaves it on disk. */
export type EvidenceFile = Pick<Express.Multer.File, 'path' | 'filename' | 'mimetype' | 'size'>;

export interface SubmitInput {
  skillId: string;
  kind: SkillTaskKind;
  claim: SkillTaskClaim | null;
  notes?: string;
  evidenceUrl?: string;
  files: EvidenceFile[];
  /** What the worker says each file is, in upload order. */
  declaredKinds: EvidenceKind[];
}

/**
 * Records a submission with its evidence and draws its first reviewer. When
 * nobody is eligible the submission is kept and the admins are asked to place it.
 */
export const submit = async (ctx: AppContext, workerId: string, input: SubmitInput) => {
  const { skillId, kind, claim, notes, evidenceUrl, files, declaredKinds } = input;
  const skill = await Skill.findByPk(skillId);
  if (!skill) throw new HttpError('Skill not found', 404);

  const { requiredApprovals, rationale } = await skillVerificationService.requiredApprovalsFor(workerId);

  const task = await SkillTask.create({
    workerId,
    skillId,
    // Kept populated with the first artifact so existing consumers of the
    // single-link field keep working; SkillTaskEvidences is authoritative.
    evidenceUrl: evidenceUrl || `/uploads/evidence/${files[0].filename}`,
    notes,
    kind,
    claim,
    status: 'pending',
    requiredApprovals,
  });

  const evidenceRows = [
    ...(evidenceUrl ? [{ taskId: task.id, kind: 'link' as EvidenceKind, url: evidenceUrl }] : []),
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

  const { reviewer, audit } = await openRound(ctx, { task, skill, round: 1, reason: 'initial' });

  if (!reviewer) {
    // The submission is kept, not discarded. In a pool this small the rotation
    // rules will sometimes leave nobody eligible, and throwing away a worker's
    // evidence is a worse outcome than queueing it for an admin to place.
    await notifyAdmins(
      ctx,
      'Skill submission needs manual assignment',
      `No reviewer was eligible for a ${skill.name} submission. Assign one from the review queue.`,
    );
    return { task, rationale, awaitingReviewer: true, audit };
  }

  // Mirrored onto the task for backwards compatibility; SkillTaskAssignments is
  // the authoritative per-round record.
  await task.update({ reviewerId: reviewer.id });
  return { task, rationale, awaitingReviewer: false, audit };
};

/**
 * Retries assignment for a task nobody was eligible to review.
 *
 * `relax` drops the repeat-pairing limit, which is sometimes the only way to
 * place a task in a small pool. It is recorded on the assignment as
 * 'manual-relaxed' precisely so the RQ1 audit can separate constrained
 * assignments from ones a human had to force. Answers with no reviewer (and
 * the audit of why) when even that finds nobody.
 */
export const assign = async (ctx: AppContext, taskId: string, relax: boolean) => {
  const task = await loadTask(taskId);
  if (task.status !== 'pending') throw new HttpError('This task is not awaiting review', 409);
  const assignments = task.assignments ?? [];
  if (assignments.some((a) => a.status === 'pending')) {
    throw new HttpError('This task already has an open assignment', 409);
  }

  const { reviewer, audit } = await openRound(ctx, {
    task,
    skill: task.skill,
    round: assignments.length ? nextRound(assignments) : 1,
    exclude: assignments.map((a) => a.reviewerId),
    reason: relax ? 'manual-relaxed' : 'manual',
    relaxPairingLimit: relax,
  });
  if (!reviewer) return { reviewer: null, audit, task: null };

  await task.update({ reviewerId: reviewer.id });
  return { reviewer, audit, task: await withDetails(task.id) };
};

/**
 * Closes a submission: marks it approved or rejected, and on approval makes
 * the skill verified at the level the reviewer judged, then recalculates trust
 * and competence and tells the worker. Shared by peer review and an admin's decision.
 */
const settle = async (ctx: AppContext, task: LoadedTask, finalStatus: SkillTaskStatus, proficiencyLevel?: number) => {
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

  await notify(ctx, {
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

export interface ReviewInput {
  decision: Decision;
  notes?: string;
  confidence?: number;
  proficiencyLevel?: number;
}

/**
 * A reviewer's verdict on their assignment, then whatever it leads to: the
 * task settles once enough reviewers agree; a split brings in a tiebreaker
 * (majority decides after three rounds); a short quorum draws the next approver.
 */
export const review = async (ctx: AppContext, reviewerId: string, taskId: string, input: ReviewInput) => {
  const { decision, notes, confidence, proficiencyLevel } = input;
  const { task, assignments, mine } = await loadOpenAssignment(taskId, reviewerId);

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

  const close = (finalStatus: SkillTaskStatus) => settle(ctx, task, finalStatus, proficiencyLevel);

  // Enough agreement to settle, in either direction.
  if (approvals >= requiredApprovals) {
    await close('approved');
  } else if (rejections >= requiredApprovals && !disagreement) {
    await close('rejected');
  } else if (disagreement && roundsUsed < 3) {
    // Split decision: bring in one more independent reviewer to break the tie.
    const { reviewer } = await openRound(ctx, {
      task,
      skill: task.skill,
      round: roundsUsed + 1,
      exclude: reviewedBy,
      reason: 'tiebreak',
    });
    if (!reviewer) {
      await close(approvals > rejections ? 'approved' : 'rejected');
    }
  } else if (disagreement) {
    // Majority decides once the escalation ceiling is reached.
    await close(approvals > rejections ? 'approved' : 'rejected');
  } else {
    // Quorum still short and no disagreement: recruit the next approver.
    const { reviewer } = await openRound(ctx, {
      task,
      skill: task.skill,
      round: roundsUsed + 1,
      exclude: reviewedBy,
      reason: 'quorum',
    });
    if (!reviewer) {
      await close(approvals > 0 ? 'approved' : 'rejected');
    }
  }

  return withDetails(task.id);
};

/**
 * A reviewer steps aside from a submission they should not judge.
 *
 * This is how a reviewer discloses a relationship with the worker (FR-5): the
 * reason is kept on the assignment for the RQ1 audit, and a reviewer who knows
 * the worker is never drawn for them again (`disclosedRelationship`). The task
 * goes straight to another eligible reviewer through the same draw; if nobody
 * is left, the admins are asked to place it, as on submission.
 */
export const recuse = async (
  ctx: AppContext,
  reviewerId: string,
  taskId: string,
  reason: RecusalReason,
  notes: string | null,
): Promise<{ reassigned: boolean }> => {
  const { task, assignments, mine } = await loadOpenAssignment(taskId, reviewerId);

  await mine.update({ status: 'recused', recusalReason: reason, notes, decidedAt: new Date() });

  const { reviewer } = await openRound(ctx, {
    task,
    skill: task.skill,
    round: nextRound(assignments),
    exclude: assignments.map((a) => a.reviewerId),
    reason: 'recusal',
  });

  if (reviewer) {
    await task.update({ reviewerId: reviewer.id });
  } else {
    await task.update({ reviewerId: null });
    await notifyAdmins(
      ctx,
      'Skill submission needs manual assignment',
      `A reviewer stepped aside from a ${task.skill?.name ?? 'skill'} submission and no one else is eligible. Assign one from the review queue.`,
    );
  }
  return { reassigned: Boolean(reviewer) };
};

/**
 * An admin decides a submission directly, whoever it is assigned to.
 *
 * Peer review is the normal path; this is for an admin who has looked at the
 * evidence and needs to settle it (a reviewer is away, or the queue is stuck).
 * It is recorded as the admin's own review, with no draw behind it, and any
 * peer still assigned is released and told, so the record shows who decided.
 */
export const adminDecide = async (
  ctx: AppContext,
  adminId: string,
  taskId: string,
  { decision, notes, proficiencyLevel }: { decision: Decision; notes: string | null; proficiencyLevel?: number },
) => {
  const task = await loadTask(taskId);
  if (task.status !== 'pending') throw new HttpError('This task has already been reviewed', 409);

  const assignments = task.assignments ?? [];
  const now = new Date();
  for (const open of assignments.filter((a) => a.status === 'pending' && a.reviewerId !== adminId)) {
    await open.update({ status: 'expired', notes: 'Closed: an admin decided this submission', decidedAt: now });
    await notify(ctx, {
      userId: open.reviewerId,
      title: 'Review no longer needed',
      body: `An admin decided the ${task.skill?.name ?? 'skill'} submission you were asked to review. Thank you.`,
    });
  }
  const mine = assignments.find((a) => a.status === 'pending' && a.reviewerId === adminId);
  if (mine) {
    await mine.update({ status: decision, notes: notes ?? mine.notes, decidedAt: now });
  } else {
    await SkillTaskAssignment.create({
      taskId: task.id,
      reviewerId: adminId,
      round: assignments.length ? nextRound(assignments) : 1,
      status: decision,
      notes: notes ? `Admin decision: ${notes}` : 'Admin decision',
      confidence: null,
      // No draw: the admin chose to decide, so there is no seed or pool to audit.
      assignmentSeed: null,
      eligiblePoolSize: null,
      assignedAt: now,
      decidedAt: now,
    });
  }
  await settle(ctx, task, decision, proficiencyLevel);
  return withDetails(task.id);
};

/**
 * The submissions a caller may see: everything for an admin, their open
 * assignments for a reviewer asking for them, otherwise their own.
 */
export const list = async (caller: AuthUser, assignedToMe: boolean): Promise<unknown[]> => {
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

  const tasks = await SkillTask.findAll({ where, include: TASK_INCLUDES, order: [['createdAt', 'DESC']] });
  if (caller.reviewerTier === 'peer' && assignedToMe) {
    // A peer judges blind to the other reviewers: their own assignment
    // only, so an earlier verdict cannot anchor the next one.
    return tasks.map((task) => {
      const json = task.toJSON() as Record<string, unknown> & { assignments?: { reviewerId: string }[] };
      return {
        ...json,
        reviewer: undefined,
        assignments: (json.assignments ?? []).filter((a) => a.reviewerId === caller.id),
      };
    });
  }
  return tasks;
};

/**
 * A worker's recourse against a reviewer acting in bad faith.
 *
 * Upholding an appeal reassigns the task while excluding every reviewer who has
 * already seen it, so the same pairing cannot decide twice.
 */
export const appeal = async (ctx: AppContext, workerId: string, taskId: string, reason: string) => {
  const task = await loadTask(taskId, { withAppeal: true });
  if (task.workerId !== workerId) throw new HttpError('Only the submitting worker may appeal', 403);
  if (task.status !== 'rejected') throw new HttpError('Only a rejected submission can be appealed', 409);
  if (task.appeal) throw new HttpError('This submission has already been appealed', 409);

  const record = await SkillTaskAppeal.create({ taskId: task.id, workerId, reason, status: 'open' });

  const assignments = task.assignments ?? [];
  const { reviewer, audit } = await openRound(ctx, {
    task,
    skill: task.skill,
    round: nextRound(assignments),
    exclude: assignments.map((a) => a.reviewerId),
    reason: 'appeal',
  });

  // The appeal stands either way; it just waits on an admin to place it when
  // no untainted reviewer is available.
  await task.update({ status: 'pending', reviewedAt: null, reviewerId: reviewer ? reviewer.id : null });
  await record.update({
    status: 'upheld',
    resolutionNotes: reviewer
      ? 'Reassigned to a new reviewer'
      : 'Upheld; awaiting manual assignment outside the original pairing',
  });

  if (!reviewer) {
    await notifyAdmins(
      ctx,
      'Appeal needs manual assignment',
      `An appealed ${task.skill?.name} submission has no eligible reviewer outside the original pairing.`,
    );
  }
  return { appeal: record, task: await withDetails(task.id), awaitingReviewer: !reviewer, audit };
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
export const declareSkill = async (workerId: string, skillId: string, proficiencyLevel?: number) => {
  const skill = await Skill.findByPk(skillId);
  if (!skill) throw new HttpError('Skill not found', 404);

  const [userSkill, created] = await UserSkill.findOrCreate({
    where: { userId: workerId, skillId },
    defaults: {
      userId: workerId,
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

  const skillRecord = await UserSkill.findByPk(userSkill.id, { include: [{ model: Skill, as: 'skill' }] });
  return { userSkill: skillRecord, created };
};

/** Every skill a worker holds, declared or verified. */
export const listSkills = (workerId: string) =>
  UserSkill.findAll({
    where: { userId: workerId },
    include: [{ model: Skill, as: 'skill' }],
    order: [['createdAt', 'ASC']],
  });
