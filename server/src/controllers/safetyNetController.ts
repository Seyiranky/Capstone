import type { Request, Response } from 'express';
import * as safetyNetService from '../services/safetyNetService';
import { authed } from '../lib/authed';

export const mine = async (req: Request, res: Response): Promise<void> => {
  res.json(await safetyNetService.summary(authed(req).id));
};

export const setSavings = async (req: Request, res: Response): Promise<void> => {
  res.json(await safetyNetService.setSavingsPercent(authed(req).id, req.body?.percent));
};

export const withdraw = async (req: Request, res: Response): Promise<void> => {
  res.json(await safetyNetService.withdraw(authed(req).id, req.body?.amount, req.body?.note));
};
