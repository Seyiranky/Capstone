import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, GigApplication } from '../models';
import notify from '../lib/notify';

type Ctx = Pick<Request, 'app'> | undefined;

/** An application unanswered this long reminds the client, once. */
export const REMIND_AFTER_MS = 48 * 60 * 60 * 1000;
/** An application unanswered this long expires, and the worker is told. */
export const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Keeps applications from waiting for ever on a client who has gone quiet.
 *
 * At 48 hours the client is reminded, once, with how many people are waiting.
 * At 7 days the application expires: the worker is told and can look elsewhere.
 * Only applications to gigs still open count: once a gig is matched or closed,
 * what happens to the rest is decided there.
 */
export const sweep = async (ctx: Ctx, now = new Date()) => {
  const open = { model: Gig, as: 'gig', where: { status: 'open' }, required: true, attributes: ['id', 'title', 'clientId'] };

  const stale = (await GigApplication.findAll({
    where: { status: 'pending', createdAt: { [Op.lte]: new Date(now.getTime() - EXPIRE_AFTER_MS) } },
    include: [open],
  })) as (GigApplication & { gig: Gig })[];
  for (const application of stale) {
    await application.update({ status: 'expired', expiredAt: now });
    await notify(ctx, {
      userId: application.workerId,
      title: 'Application expired',
      body: `The client did not answer your application for "${application.gig.title}" within 7 days, so it has expired. Other gigs are waiting for you.`,
      category: 'outcome',
    });
  }

  const waiting = (await GigApplication.findAll({
    where: {
      status: 'pending',
      remindedAt: null,
      createdAt: { [Op.lte]: new Date(now.getTime() - REMIND_AFTER_MS) },
    },
    include: [open],
  })) as (GigApplication & { gig: Gig })[];
  const byGig = new Map<string, (GigApplication & { gig: Gig })[]>();
  for (const a of waiting) byGig.set(a.gigId, [...(byGig.get(a.gigId) ?? []), a]);
  for (const apps of byGig.values()) {
    const gig = apps[0].gig;
    await notify(ctx, {
      userId: gig.clientId,
      title: 'Applicants are waiting',
      body: `${apps.length === 1 ? 'A worker has' : `${apps.length} workers have`} waited over two days for an answer on "${gig.title}". Choose someone or turn them down; unanswered applications expire after 7 days.`,
      category: 'outcome',
    });
    await GigApplication.update({ remindedAt: now }, { where: { id: apps.map((a) => a.id) } });
  }
  return { expired: stale.length, reminded: waiting.length };
};
