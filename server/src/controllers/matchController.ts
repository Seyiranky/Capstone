import { Op } from 'sequelize';
import type { Request, Response } from 'express';
import type { Includeable } from 'sequelize';
import fs from 'fs';
import crypto from 'crypto';
import { Match, MatchMember, Gig, User, Transaction, Review, JobPhoto } from '../models';
import * as safeVisitService from '../services/safeVisitService';
import { MAX_JOB_PHOTOS } from '../middleware/upload';
import * as completionService from '../services/completionService';
import * as matchStatusService from '../services/matchStatusService';
import { authed } from '../lib/authed';
import { pathParam } from '../lib/query';

const MATCH_INCLUDES: Includeable[] = [
  { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] },
  { model: User, as: 'worker' },
  { model: Transaction, as: 'transaction' },
  { model: Review, as: 'reviews' },
  { model: JobPhoto, as: 'photos', attributes: ['id', 'url', 'sha256', 'createdAt'] },
  {
    model: MatchMember,
    as: 'members',
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'trustScore', 'reviewCount'] }],
  },
];

export const listMatches = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  let matches: Match[];
  if (caller.role === 'worker') {
    // Jobs they lead, and jobs they are on as crew or apprentice.
    const memberOf = (
      await MatchMember.findAll({ where: { userId: caller.id }, attributes: ['matchId'] })
    ).map((m) => m.matchId);
    matches = await Match.findAll({
      where: { [Op.or]: [{ workerId: caller.id }, { id: memberOf }] },
      include: MATCH_INCLUDES,
    });
  } else if (caller.role === 'admin') {
    matches = await Match.findAll({ include: MATCH_INCLUDES });
  } else {
    matches = await Match.findAll({
      include: [
        { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }], where: { clientId: caller.id } },
        ...MATCH_INCLUDES.slice(1),
      ],
    });
  }
  res.json(matches);
};

/**
 * Accept, decline or call off a match. The rules and the single transaction
 * they run in live in matchStatusService; this only maps HTTP to it.
 */
export const updateMatchStatus = async (req: Request, res: Response): Promise<void> => {
  const id = await matchStatusService.changeStatus(req, pathParam(req, 'id'), authed(req).id, req.body ?? {});
  res.json(await Match.findByPk(id, { include: MATCH_INCLUDES }));
};

/**
 * The worker attaches photos of the finished work, while the job is in progress
 * or after it is done. They become the job's entry in the worker's work history,
 * and, during a dispute, something the mediators can look at.
 */
export const addJobPhotos = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const discard = () => files.forEach((f) => fs.rm(f.path, { force: true }, () => undefined));

  const match = await Match.findByPk(pathParam(req, 'id'));
  if (!match) {
    discard();
    res.status(404).json({ message: 'Match not found' });
    return;
  }
  if (match.workerId !== caller.id) {
    discard();
    res.status(403).json({ message: 'Only the worker on this job may add photos' });
    return;
  }
  if (match.status !== 'accepted' && match.status !== 'completed') {
    discard();
    res.status(409).json({ message: 'Photos can only be added to a job in progress or done' });
    return;
  }
  if (files.length === 0) {
    res.status(400).json({ message: 'Attach at least one photo' });
    return;
  }
  const existing = await JobPhoto.count({ where: { matchId: match.id } });
  if (existing + files.length > MAX_JOB_PHOTOS) {
    discard();
    res.status(409).json({ message: `A job can have at most ${MAX_JOB_PHOTOS} photos` });
    return;
  }

  await JobPhoto.bulkCreate(
    files.map((file) => ({
      matchId: match.id,
      url: `/uploads/jobs/${file.filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex'),
    })),
  );
  res.status(201).json(await Match.findByPk(match.id, { include: MATCH_INCLUDES }));
};

const visitHandler =
  (action: typeof safeVisitService.checkIn) =>
  async (req: Request, res: Response): Promise<void> => {
    const caller = authed(req);
    res.status(201).json(await action(req, pathParam(req, 'id'), caller.id, { lat: req.body?.lat, lng: req.body?.lng }));
  };

/** Safe visit: arrive, leave, or ask for help on an on-site job. */
/** The worker says the work is finished; the client is asked to mark it done and pay. */
export const reportWorkDone = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const match = (await Match.findByPk(pathParam(req, 'id'), { include: [{ model: Gig, as: 'gig' }] })) as
    | (Match & { gig?: Gig | null })
    | null;
  if (!match) {
    res.status(404).json({ message: 'Match not found' });
    return;
  }
  await completionService.reportWorkDone(req, match, caller.id);
  res.json(await Match.findByPk(match.id, { include: MATCH_INCLUDES }));
};

export const checkIn = visitHandler(safeVisitService.checkIn);
export const checkOut = visitHandler(safeVisitService.checkOut);
export const sos = visitHandler(safeVisitService.sos);

export const visitStatus = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.statusFor(pathParam(req, 'id'), authed(req).id));
};
