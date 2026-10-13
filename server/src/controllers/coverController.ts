import type { Request, Response } from 'express';
import { User } from '../models';
import * as coverService from '../services/coverService';
import { authed } from '../lib/authed';
import notify from '../lib/notify';
import { pathParam } from '../lib/query';

export const status = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(await coverService.status(pathParam(req, 'id'), { id: caller.id, role: caller.role }));
};

/** A covered worker files a claim; every admin is told. */
export const fileClaim = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const claim = await coverService.fileClaim(pathParam(req, 'id'), caller.id, req.body ?? {});
  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  for (const admin of admins) {
    await notify(req, {
      userId: admin.id,
      title: 'Job Cover claim',
      body: `A worker claimed ${claim.amountRequested.toLocaleString()} RWF for an accident on a job. Review it under Money › Job Cover.`,
      category: 'activity',
    });
  }
  res.status(201).json(claim);
};

export const listClaims = async (_req: Request, res: Response): Promise<void> => {
  res.json(await coverService.listClaims());
};

/** Admin decision; the worker is told either way, with the reason when declined. */
export const decide = async (req: Request, res: Response): Promise<void> => {
  const claim = await coverService.decide(pathParam(req, 'id'), authed(req).id, req.body ?? {});
  await notify(req, {
    userId: claim.userId,
    title: claim.status === 'approved' ? 'Your Job Cover claim was approved' : 'Your Job Cover claim was declined',
    body:
      claim.status === 'approved'
        ? `The insurer will pay ${Number(claim.amountApproved).toLocaleString()} RWF towards your treatment.`
        : `Reason: ${claim.decisionNote}`,
    category: 'outcome',
  });
  res.json(claim);
};
