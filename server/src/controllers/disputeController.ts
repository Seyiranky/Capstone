import type { Request, Response } from 'express';
import * as disputeService from '../services/disputeService';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';

export const openDispute = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const dispute = await disputeService.open(req, {
    matchId: String(req.body?.matchId ?? ''),
    userId: caller.id,
    reason: String(req.body?.reason ?? ''),
    details: String(req.body?.details ?? ''),
  });
  res.status(201).json(dispute);
};

export const listDisputes = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(await disputeService.listFor(caller.id, caller.role));
};

export const respond = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(await disputeService.respond(pathParam(req, 'id'), caller.id, String(req.body?.response ?? '')));
};

export const vote = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(
    await disputeService.vote(req, {
      disputeId: pathParam(req, 'id'),
      mediatorId: caller.id,
      outcome: String(req.body?.outcome ?? ''),
      rationale: req.body?.rationale,
    }),
  );
};

export const resolve = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(
    await disputeService.adminResolve(req, {
      disputeId: pathParam(req, 'id'),
      adminId: caller.id,
      outcome: String(req.body?.outcome ?? ''),
      note: req.body?.note,
    }),
  );
};
