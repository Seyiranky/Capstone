import type { Request, Response } from 'express';
import type { Includeable, WhereOptions } from 'sequelize';
import { GigApplication, Gig, User, Match } from '../models';
import * as matchScoringService from '../services/matchScoringService';
import notify from '../lib/notify';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import { QUOTE_MAX, QUOTE_MIN, QUOTE_NOTE_MAX } from '../services/escrowRules';
import { REJECTION_REASONS, type RejectionReason } from '../types/domain';

/** What the worker is told, with the next step where there is one. */
const REASON_TEXT: Record<RejectionReason, string> = {
  skillLevel: 'the job needs a higher skill level. Verifying this skill on Isoko will help next time.',
  distance: 'the job is too far from you.',
  timing: 'the timing did not work.',
  choseAnother: 'another applicant was chosen.',
  other: 'the reviewer gave another reason.',
};

const APPLICATION_INCLUDES: Includeable[] = [
  { model: Gig, as: 'gig' },
  { model: User, as: 'worker' },
];

/** An application with its gig loaded, which the ownership checks read. */
type LoadedApplication = GigApplication & { gig?: Gig | null };

export const applyToGig = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { gigId, occurredAt, queuedOffline, quoteAmount, quoteNote } = req.body ?? {};
  if (!gigId) {
    res.status(400).json({ message: 'gigId is required' });
    return;
  }

  // A quote is optional; without one the worker is taking the posted budget.
  let quote: number | null = null;
  if (quoteAmount !== undefined && quoteAmount !== null && quoteAmount !== '') {
    quote = Number(quoteAmount);
    if (!Number.isFinite(quote) || quote < QUOTE_MIN || quote > QUOTE_MAX) {
      res.status(400).json({
        message: `A quote must be between ${QUOTE_MIN} and ${QUOTE_MAX.toLocaleString()} RWF`,
      });
      return;
    }
    quote = Math.round(quote);
  }
  const note = typeof quoteNote === 'string' ? quoteNote.trim().slice(0, QUOTE_NOTE_MAX) || null : null;

  const gig = await Gig.findByPk(gigId);
  if (!gig) {
    res.status(404).json({ message: 'Gig not found' });
    return;
  }
  if (gig.status !== 'open') {
    res.status(409).json({ message: 'This gig is not open for applications' });
    return;
  }

  const existing = await GigApplication.findOne({ where: { gigId, workerId: caller.id } });
  if (existing) {
    res.status(409).json({ message: 'You have already applied to this gig' });
    return;
  }

  // A ranked invitation is already an offer to this worker; applying on top of
  // it would create a second match for the same pair.
  const invited = await Match.findOne({
    where: { gigId, workerId: caller.id, status: 'pending' },
  });
  if (invited) {
    res
      .status(409)
      .json({ message: 'You were already matched to this gig — confirm that invitation instead' });
    return;
  }

  // Score the pair now so the client's review queue is ranked and explainable.
  // A worker with no record of the skill is still allowed to apply; they simply
  // score zero on skill fit and the breakdown says so.
  const worker = await User.findByPk(caller.id);
  if (!worker) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const scored = await matchScoringService.scoreOne({ gig, worker });

  const now = new Date();
  const claimed = occurredAt ? new Date(occurredAt) : null;
  const occurred =
    queuedOffline && claimed && !Number.isNaN(claimed.getTime()) && claimed <= now ? claimed : null;

  const application = await GigApplication.create({
    gigId,
    workerId: caller.id,
    status: 'pending',
    occurredAt: occurred ?? now,
    wasQueuedOffline: Boolean(occurred),
    rankScore: scored.score,
    scoreBreakdown: scored,
    weightProfileId: scored.weightProfile.id,
    quoteAmount: quote,
    quoteNote: note,
  });

  const admins = await User.findAll({ where: { role: 'admin' } });
  await Promise.all(
    admins.map((admin) =>
      notify(req, {
        userId: admin.id,
        title: 'New gig application',
        body: quote
          ? `${worker.name} applied to "${gig.title}", quoting ${quote.toLocaleString()} RWF.`
          : `${worker.name} applied to "${gig.title}".`,
      }),
    ),
  );

  res.status(201).json(application);
};

export const listApplications = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const where: WhereOptions<GigApplication> & { gigId?: string; workerId?: string } = {};
  const gigId = stringParam(req, 'gigId');
  if (gigId) {
    where.gigId = gigId;
  }
  if (caller.role === 'worker') {
    where.workerId = caller.id;
  }

  const applications = (await GigApplication.findAll({
    where,
    include: APPLICATION_INCLUDES,
    order: [['createdAt', 'DESC']],
  })) as LoadedApplication[];

  const visible =
    caller.role === 'client'
      ? applications.filter((application) => application.gig?.clientId === caller.id)
      : applications;

  res.json(visible);
};

export const reviewApplication = async (req: Request, res: Response): Promise<void> => {
  const { decision, reason, note } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  // A rejection must say why: the worker is owed a reason they can act on.
  if (decision === 'rejected' && !REJECTION_REASONS.includes(reason)) {
    res.status(400).json({ message: `reason must be one of ${REJECTION_REASONS.join(', ')}` });
    return;
  }

  const application = (await GigApplication.findByPk(pathParam(req, 'id'), {
    include: APPLICATION_INCLUDES,
  })) as LoadedApplication | null;
  if (!application) {
    res.status(404).json({ message: 'Application not found' });
    return;
  }
  if (application.status !== 'pending') {
    res.status(409).json({ message: 'This application has already been reviewed' });
    return;
  }

  if (decision === 'rejected') {
    const rejectionNote = typeof note === 'string' ? note.trim().slice(0, 280) || null : null;
    await application.update({ status: 'rejected', rejectionReason: reason, rejectionNote });
    await notify(req, {
      userId: application.workerId,
      title: 'Application not selected',
      body: `Your application for "${application.gig?.title}" was not selected: ${REASON_TEXT[reason as RejectionReason]}`,
      // The answer to something the worker applied for and is waiting on.
      category: 'outcome',
    });
    res.json({ application });
    return;
  }

  await application.update({ status: 'approved' });

  // Born pending, not accepted: the worker confirms they are still available.
  // Sibling applications stay pending until that confirmation, so a decline
  // leaves the gig fillable instead of stranding it with no candidates.
  const match = await Match.create({
    gigId: application.gigId,
    workerId: application.workerId,
    status: 'pending',
    origin: 'manual',
    // Approving a quote is agreeing to its price.
    agreedAmount: application.quoteAmount ?? null,
  });
  await application.gig?.update({ status: 'matched' });

  await notify(req, {
    userId: application.workerId,
    title: 'Application approved',
    body: `Your application for "${application.gig?.title}" was approved. Confirm you're still available to take it.`,
    // Work won, and it needs the worker to act before the gig moves on.
    category: 'outcome',
  });
  await notify(req, {
    userId: application.gig?.clientId as string,
    title: 'Worker selected',
    body: `A worker was selected for "${application.gig?.title}" and has been asked to confirm.`,
    // Left in-app: the client triggered this by approving the application, so
    // an email would report their own click back to them, and "Worker
    // confirmed" covers the same hiring event once it actually resolves.
  });

  res.json({ application, match });
};
