import type { Request, Response } from 'express';
import { User } from '../models';
import * as directory from '../services/workerDirectoryService';
import { authed } from '../lib/authed';
import notify from '../lib/notify';
import { pathParam, stringParam } from '../lib/query';

const SORTS = ['trust', 'jobs', 'newest'] as const;

export const list = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const viewer = await User.findByPk(caller.id, { attributes: ['id', 'experimentArm'] });
  const sort = stringParam(req, 'sort');
  res.json(
    await directory.list(
      {
        q: stringParam(req, 'q') ?? undefined,
        category: stringParam(req, 'category') ?? undefined,
        area: stringParam(req, 'area') ?? undefined,
        proven: stringParam(req, 'proven') === 'true',
        available: stringParam(req, 'available') === 'true',
        sort: SORTS.includes(sort as (typeof SORTS)[number]) ? (sort as (typeof SORTS)[number]) : 'trust',
      },
      { id: caller.id, arm: viewer?.experimentArm ?? null },
    ),
  );
};

/** A client offers one of their open gigs to a worker they found. */
export const invite = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const { match, gig } = await directory.invite(caller.id, pathParam(req, 'id'), String(req.body?.workerId ?? ''));
  const client = await User.findByPk(caller.id, { attributes: ['name'] });
  await notify(req, {
    userId: match.workerId,
    title: 'A client asked for you',
    body: `${client?.name ?? 'A client'} would like you to take "${gig.title}" (${Number(gig.budget).toLocaleString()} RWF). Confirm if you can.`,
    category: 'outcome',
  });
  res.status(201).json(match);
};
