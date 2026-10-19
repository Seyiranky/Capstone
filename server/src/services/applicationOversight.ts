import { Op } from 'sequelize';
import type { Request } from 'express';
import { Gig, GigApplication, Report, User } from '../models';
import notify from '../lib/notify';
import { HttpError } from '../lib/httpError';
import * as rateService from './rateService';
import { REMIND_AFTER_MS } from './applicationFollowUp';

type Ctx = Pick<Request, 'app'> | undefined;

export type ApplicationFlag = 'overdue' | 'sensitive' | 'report_worker' | 'report_client' | 'burst' | 'low_price';

/** This many applications by one worker within ten minutes looks like spraying, not choosing. */
export const BURST_COUNT = 5;
const BURST_WINDOW_MS = 10 * 60 * 1000;
/** A price under half the low end of what the trade pays is worth a look. */
const LOW_PRICE_SHARE = 0.5;

/**
 * Applications an admin may need to look at, without approving each one.
 *
 * Only pending applications to open gigs. Each carries the reasons it is
 * worth a look: waiting on the client too long, a sensitive gig, an open
 * report on either person, a burst of applications from one worker, or a
 * price far below what the trade usually pays. With `all`, unflagged ones too.
 */
export const overview = async ({ all = false, now = new Date() } = {}) => {
  const pending = (await GigApplication.findAll({
    where: { status: 'pending' },
    include: [
      {
        model: Gig,
        as: 'gig',
        where: { status: 'open' },
        required: true,
        attributes: ['id', 'title', 'budget', 'skillId', 'sensitive', 'clientId'],
        include: [{ model: User, as: 'client', attributes: ['id', 'name', 'avatarUrl'] }],
      },
      { model: User, as: 'worker', attributes: ['id', 'name', 'avatarUrl', 'trustScore', 'reviewCount', 'completedJobCount'] },
    ],
    order: [['createdAt', 'ASC']],
  })) as (GigApplication & { gig: Gig & { client?: User }; worker?: User })[];

  const people = [...new Set(pending.flatMap((a) => [a.workerId, a.gig.clientId]))];
  const reported = new Set(
    (await Report.findAll({ where: { reportedUserId: people, status: 'open' }, attributes: ['reportedUserId'] })).map((r) => r.reportedUserId),
  );
  const rates = new Map<string, number | null>();
  const lowEnd = async (skillId: string) => {
    if (!rates.has(skillId)) rates.set(skillId, (await rateService.forSkill(skillId))?.p25 ?? null);
    return rates.get(skillId) ?? null;
  };

  const rows = [];
  for (const a of pending) {
    const flags: ApplicationFlag[] = [];
    const waitedMs = now.getTime() - a.createdAt.getTime();
    if (waitedMs > REMIND_AFTER_MS) flags.push('overdue');
    if (a.gig.sensitive) flags.push('sensitive');
    if (reported.has(a.workerId)) flags.push('report_worker');
    if (reported.has(a.gig.clientId)) flags.push('report_client');
    const burst = await GigApplication.count({
      where: {
        workerId: a.workerId,
        createdAt: {
          [Op.between]: [new Date(a.createdAt.getTime() - BURST_WINDOW_MS), new Date(a.createdAt.getTime() + BURST_WINDOW_MS)],
        },
      },
    });
    if (burst >= BURST_COUNT) flags.push('burst');
    const price = Number(a.quoteAmount ?? a.gig.budget);
    const p25 = await lowEnd(a.gig.skillId);
    if (p25 && price < p25 * LOW_PRICE_SHARE) flags.push('low_price');
    if (!all && flags.length === 0) continue;
    rows.push({
      id: a.id,
      createdAt: a.createdAt,
      waitedHours: Math.round(waitedMs / 3_600_000),
      remindedAt: a.remindedAt,
      quoteAmount: a.quoteAmount,
      price,
      usualLow: p25,
      flags,
      gig: { id: a.gig.id, title: a.gig.title, budget: a.gig.budget, sensitive: a.gig.sensitive },
      client: a.gig.client ? { id: a.gig.client.id, name: a.gig.client.name, avatarUrl: a.gig.client.avatarUrl } : null,
      worker: a.worker
        ? {
            id: a.worker.id,
            name: a.worker.name,
            avatarUrl: a.worker.avatarUrl,
            trustScore: a.worker.trustScore,
            reviewCount: a.worker.reviewCount,
            completedJobCount: a.worker.completedJobCount,
          }
        : null,
    });
  }
  const counts: Record<ApplicationFlag, number> = { overdue: 0, sensitive: 0, report_worker: 0, report_client: 0, burst: 0, low_price: 0 };
  for (const r of rows) for (const f of r.flags) counts[f] += 1;
  return { applications: rows, counts, pendingTotal: pending.length };
};

/** How many pending applications need a look, for the admin sidebar. */
export const flaggedCount = async () => (await overview()).applications.length;

/** An admin withdraws an application, saying why; the worker and the client are told. */
export const withdraw = async (ctx: Ctx, applicationId: string, reason: unknown) => {
  const text = typeof reason === 'string' ? reason.trim().slice(0, 280) : '';
  if (text.length < 5) throw new HttpError('Give the worker a reason, in a sentence', 400);
  const application = (await GigApplication.findByPk(applicationId, {
    include: [{ model: Gig, as: 'gig', attributes: ['id', 'title', 'clientId'] }],
  })) as (GigApplication & { gig?: Gig }) | null;
  if (!application) throw new HttpError('Application not found', 404);
  if (application.status !== 'pending') throw new HttpError('Only a pending application can be withdrawn', 409);
  await application.update({ status: 'withdrawn', rejectionReason: 'other', rejectionNote: text });
  const title = application.gig?.title ?? 'a gig';
  await notify(ctx, {
    userId: application.workerId,
    title: 'Application withdrawn',
    body: `An Isoko admin withdrew your application for "${title}": ${text}`,
    category: 'outcome',
  });
  if (application.gig) {
    await notify(ctx, {
      userId: application.gig.clientId,
      title: 'An admin withdrew an application',
      body: `An Isoko admin withdrew an application for "${title}".`,
    });
  }
  return application;
};
