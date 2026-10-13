import type { Request, Response } from 'express';
import * as fairworkService from '../services/fairworkService';

/** Public: anyone can see how Isoko scores against the Fairwork principles. */
export const scorecard = async (_req: Request, res: Response): Promise<void> => {
  res.json(await fairworkService.compute());
};
