import fs from 'fs';
import type { Request, Response } from 'express';
import { evidenceLimitFor } from '../middleware/upload';
import * as skillTaskService from '../services/skillTaskService';
import { EVIDENCE_KINDS, RECUSAL_REASONS } from '../services/skillTaskService';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import type { EvidenceKind, SkillTaskKind } from '../types/domain';
import type { SkillTaskClaim } from '../models/SkillTask';

/*
 * Skill submissions over HTTP. Each handler checks the request, calls
 * skillTaskService and shapes the answer; the rules live in the service, and
 * the HttpErrors it throws reach the caller through the error middleware.
 */

const isLevel = (value: unknown) => value === undefined || [1, 2, 3, 4, 5].includes(value as number);
const isDecision = (value: unknown): value is skillTaskService.Decision =>
  value === 'approved' || value === 'rejected';

/** Optional free text, trimmed and capped; empty becomes null. */
const optionalText = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

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

  // A photograph of a certificate and a photograph of finished work have the
  // same mime type, so the client says which it is and the server trusts that
  // over sniffing.
  const declaredKinds = ([] as unknown[])
    .concat(req.body?.evidenceKind ?? [])
    .filter((k): k is EvidenceKind => EVIDENCE_KINDS.includes(k as EvidenceKind));

  const { task, rationale, awaitingReviewer, audit } = await skillTaskService.submit(req, caller.id, {
    skillId,
    kind: kind as SkillTaskKind,
    claim,
    notes,
    evidenceUrl,
    files,
    declaredKinds,
  });

  res.status(201).json(
    awaitingReviewer
      ? { ...task.toJSON(), quorumRationale: rationale, awaitingReviewer: true, assignmentAudit: audit }
      : { ...task.toJSON(), quorumRationale: rationale },
  );
};

/** An admin places a task nobody was eligible to review; `relax=true` drops the pairing limit. */
export const assignTask = async (req: Request, res: Response): Promise<void> => {
  const relax = stringParam(req, 'relax') === 'true';
  const { reviewer, audit, task } = await skillTaskService.assign(req, pathParam(req, 'id'), relax);

  if (!reviewer) {
    res.status(409).json({
      message: relax
        ? 'No reviewer is eligible even with the pairing limit relaxed'
        : 'No reviewer is eligible; retry with relax=true to drop the pairing limit',
      audit,
    });
    return;
  }
  res.json(task);
};

export const reviewTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { decision, notes, confidence, proficiencyLevel } = req.body ?? {};
  if (!isDecision(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  if (!isLevel(confidence)) {
    res.status(400).json({ message: 'confidence must be an integer from 1 to 5' });
    return;
  }
  if (!isLevel(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }

  res.json(
    await skillTaskService.review(req, caller.id, pathParam(req, 'id'), {
      decision,
      notes,
      confidence,
      proficiencyLevel,
    }),
  );
};

/** A reviewer steps aside, saying why (FR-5's disclosure of a relationship). */
export const recuseTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { reason, notes } = req.body ?? {};
  if (!RECUSAL_REASONS.includes(reason)) {
    res.status(400).json({ message: `reason must be one of ${RECUSAL_REASONS.join(', ')}` });
    return;
  }

  const { reassigned } = await skillTaskService.recuse(
    req,
    caller.id,
    pathParam(req, 'id'),
    reason,
    optionalText(notes, 500),
  );
  res.json({ recused: true, reassigned });
};

/** An admin decides a submission directly, whoever it is assigned to. */
export const adminDecide = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { decision, notes, proficiencyLevel } = req.body ?? {};
  if (!isDecision(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  if (!isLevel(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }

  res.json(
    await skillTaskService.adminDecide(req, caller.id, pathParam(req, 'id'), {
      decision,
      notes: optionalText(notes, 1000),
      proficiencyLevel,
    }),
  );
};

export const listTasks = async (req: Request, res: Response): Promise<void> => {
  res.json(await skillTaskService.list(authed(req), stringParam(req, 'assignedToMe') === 'true'));
};

/** A worker appeals a rejection; it goes to a reviewer who has not seen it. */
export const appealTask = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { reason } = req.body ?? {};
  if (!reason || !reason.trim()) {
    res.status(400).json({ message: 'reason is required to appeal' });
    return;
  }

  const { appeal, task, awaitingReviewer, audit } = await skillTaskService.appeal(
    req,
    caller.id,
    pathParam(req, 'id'),
    reason.trim(),
  );
  res.status(201).json(awaitingReviewer ? { appeal, task, awaitingReviewer: true, audit } : { appeal, task });
};

/** Records a skill the worker says they have: the weakest tier, labelled as such. */
export const declareSkill = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { skillId, proficiencyLevel } = req.body ?? {};
  if (!skillId) {
    res.status(400).json({ message: 'skillId is required' });
    return;
  }
  if (!isLevel(proficiencyLevel)) {
    res.status(400).json({ message: 'proficiencyLevel must be an integer from 1 to 5' });
    return;
  }

  const { userSkill, created } = await skillTaskService.declareSkill(caller.id, skillId, proficiencyLevel);
  res.status(created ? 201 : 200).json(userSkill);
};

/** Every skill the signed-in worker holds, declared or verified. */
export const listMySkills = async (req: Request, res: Response): Promise<void> => {
  res.json(await skillTaskService.listSkills(authed(req).id));
};
