import type { Request, Response } from 'express';
import * as passportService from '../services/passportService';
import * as incomeStatementService from '../services/incomeStatementService';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';

/**
 * Issues a fresh passport, revoking any earlier one.
 *
 * Only one live passport per worker: a stack of valid links would make
 * revocation meaningless if a worker ever needed to withdraw one.
 */
export const issue = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  await passportService.revokeAllFor(user.id);
  const issued = await passportService.issue(user.id);
  if (!issued) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.status(201).json(issued);
};

export const revoke = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  await passportService.revokeAllFor(user.id);
  res.json({ message: 'Passport revoked' });
};

/** Public: a client checking a worker's credential needs no account. */
export const read = async (req: Request, res: Response): Promise<void> => {
  const result = await passportService.read(pathParam(req, 'token'));
  if (!result.valid) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
};

export const verify = async (req: Request, res: Response): Promise<void> => {
  const result = await passportService.verify(pathParam(req, 'token'));
  if (!result.valid) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
};

export const incomeStatement = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const from = stringParam(req, 'from');
  const to = stringParam(req, 'to');
  const format = stringParam(req, 'format');
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    res.status(400).json({ message: 'from and to must be valid dates' });
    return;
  }

  const statement = await incomeStatementService.build(user.id, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  if (!statement) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="isoko-income-statement.csv"');
    res.send(incomeStatementService.toCsv(statement));
    return;
  }

  res.json(statement);
};

export const verifyIncomeStatement = async (req: Request, res: Response): Promise<void> => {
  const { signature } = req.body ?? {};
  if (!signature) {
    res.status(400).json({ message: 'signature is required' });
    return;
  }
  const result = await incomeStatementService.verify(signature);
  if (!result.valid) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
};
