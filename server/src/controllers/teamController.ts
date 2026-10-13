import type { Request, Response } from 'express';
import * as teamService from '../services/teamService';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';

export const inviteApprentice = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const member = await teamService.inviteApprentice(req, {
    matchId: pathParam(req, 'id'),
    leadId: caller.id,
    apprenticeId: String(req.body?.apprenticeId ?? ''),
    sharePercent: Number(req.body?.sharePercent ?? 0),
  });
  res.status(201).json(member);
};

export const respond = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(
    await teamService.respond(req, {
      memberId: pathParam(req, 'memberId'),
      userId: caller.id,
      accept: req.body?.accept === true,
    }),
  );
};

export const endorse = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  res.json(
    await teamService.endorse(req, {
      memberId: pathParam(req, 'memberId'),
      leadId: caller.id,
      endorse: req.body?.endorse === true,
      note: req.body?.note,
    }),
  );
};
