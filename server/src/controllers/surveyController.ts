import type { Request, Response } from 'express';
import type { WhereOptions } from 'sequelize';
import { SurveyResponse } from '../models';
import { authed } from '../lib/authed';
import { stringParam } from '../lib/query';

// Fixed set so the pilot analysis has stable, comparable prompt keys.
const PROMPT_KEYS = [
  'willingnessToHire',
  'matchRelevance',
  'verificationConfidence',
  'easeOfUse',
];

export const submitResponse = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const { promptKey, value, context } = req.body ?? {};

  if (!PROMPT_KEYS.includes(promptKey)) {
    res.status(400).json({ message: `promptKey must be one of: ${PROMPT_KEYS.join(', ')}` });
    return;
  }
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    res.status(400).json({ message: 'value must be an integer from 1 to 7' });
    return;
  }
  if (
    context !== undefined &&
    (typeof context !== 'object' || context === null || Array.isArray(context))
  ) {
    res.status(400).json({ message: 'context must be an object' });
    return;
  }

  const response = await SurveyResponse.create({
    userId: user.id,
    promptKey,
    value,
    context: context || null,
  });

  res.status(201).json(response);
};

export const listResponses = async (req: Request, res: Response): Promise<void> => {
  const user = authed(req);
  const where: WhereOptions<SurveyResponse> & { promptKey?: string; userId?: string } =
    user.role === 'admin' ? {} : { userId: user.id };
  const promptKey = stringParam(req, 'promptKey');
  if (promptKey) {
    where.promptKey = promptKey;
  }

  const responses = await SurveyResponse.findAll({ where, order: [['createdAt', 'DESC']] });
  res.json(responses);
};
