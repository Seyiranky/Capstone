import type { Request, Response } from 'express';
import * as workerVoice from '../services/workerVoiceService';
import { authed } from '../lib/authed';
import notify from '../lib/notify';
import { pathParam } from '../lib/query';

/** Public: every poll with its counts. A signed-in worker also sees their own vote. */
export const list = async (req: Request, res: Response): Promise<void> => {
  res.json(await workerVoice.list(req.user ? { id: req.user.id, role: req.user.role } : undefined));
};

export const vote = async (req: Request, res: Response): Promise<void> => {
  await workerVoice.vote(pathParam(req, 'id'), authed(req).id, Number(req.body?.optionIndex));
  res.status(201).json({ ok: true });
};

/** Admin: opens a poll and tells every worker who may vote. */
export const create = async (req: Request, res: Response): Promise<void> => {
  const poll = await workerVoice.create(authed(req).id, req.body ?? {});
  for (const worker of await workerVoice.voters()) {
    await notify(req, {
      userId: worker.id,
      title: 'Your vote is asked for',
      body: `Workers decide: "${poll.question}" Vote in Worker Voice before ${poll.closesAt.toDateString()}.`,
      category: 'activity',
    });
  }
  res.status(201).json(poll);
};

/** Admin: closes a poll with the platform's response, which every voter is sent. */
export const close = async (req: Request, res: Response): Promise<void> => {
  const poll = await workerVoice.close(pathParam(req, 'id'), req.body?.outcome);
  for (const worker of await workerVoice.voters()) {
    await notify(req, {
      userId: worker.id,
      title: 'Worker Voice result',
      body: `"${poll.question}" is closed. What happens now: ${poll.outcome}`,
      category: 'activity',
    });
  }
  res.json(poll);
};
