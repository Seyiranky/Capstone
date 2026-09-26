import type { Request, Response } from 'express';
import type { Includeable, WhereOptions } from 'sequelize';
import { GigApplication, Gig, User, Match } from '../models';
import * as matchScoringService from '../services/matchScoringService';
import notify from '../lib/notify';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';

const APPLICATION_INCLUDES: Includeable[] = [
  { model: Gig, as: 'gig' },
  { model: User, as: 'worker' },
];

/** An application with its gig loaded, which the ownership checks read. */
type LoadedApplication = GigApplication & { gig?: Gig | null };

export const applyToGig = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { gigId, occurredAt, queuedOffline } = req.body ?? {};
  if (!gigId) {
    res.status(400).json({ message: 'gigId is required' });
    return;
  }

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
  });

  const admins = await User.findAll({ where: { role: 'admin' } });
  await Promise.all(
    admins.map((admin) =>
      notify(req, {
        userId: admin.id,
        title: 'New gig application',
        body: `${worker.name} applied to "${gig.title}".`,
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
  const { decision } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
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
    await application.update({ status: 'rejected' });
    await notify(req, {
      userId: application.workerId,
      title: 'Application not selected',
      body: `Your application for "${application.gig?.title}" was not selected.`,
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
  });
  await application.gig?.update({ status: 'matched' });

  await notify(req, {
    userId: application.workerId,
    title: 'Application approved',
    body: `Your application for "${application.gig?.title}" was approved. Confirm you're still available to take it.`,
  });
  await notify(req, {
    userId: application.gig?.clientId as string,
    title: 'Worker selected',
    body: `A worker was selected for "${application.gig?.title}" and has been asked to confirm.`,
  });

  res.json({ application, match });
};
