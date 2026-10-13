import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Report, User } from '../models';
import { REPORT_REASONS, type ReportReason } from '../models/Report';
import { authed } from '../lib/authed';
import notify from '../lib/notify';
import { pathParam } from '../lib/query';

const NOTE_MAX = 1000;
const OPEN_REPORTS_PER_DAY = 10;

/**
 * Reports a user to the admins.
 *
 * One open report per person reported, per reporter: repeating it adds
 * nothing for the admin and would let one person flood the queue.
 */
export const createReport = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const reportedUserId = String(req.body?.reportedUserId ?? '');
  const reason = req.body?.reason as ReportReason;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, NOTE_MAX) || null : null;

  if (!reportedUserId || !REPORT_REASONS.includes(reason)) {
    res.status(400).json({ message: `reportedUserId and a reason (${REPORT_REASONS.join(', ')}) are required` });
    return;
  }
  if (reportedUserId === caller.id) {
    res.status(400).json({ message: 'You cannot report yourself' });
    return;
  }
  const reported = await User.findByPk(reportedUserId);
  if (!reported || reported.role === 'admin') {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const existing = await Report.findOne({ where: { reporterId: caller.id, reportedUserId, status: 'open' } });
  if (existing) {
    res.status(409).json({ message: 'You have already reported this person. An admin is looking into it.' });
    return;
  }
  const today = await Report.count({
    where: { reporterId: caller.id, createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (today >= OPEN_REPORTS_PER_DAY) {
    res.status(429).json({ message: 'You have sent a lot of reports today. Try again tomorrow.' });
    return;
  }

  const report = await Report.create({
    reporterId: caller.id,
    reportedUserId,
    reason,
    note,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
  });

  const admins = await User.findAll({ where: { role: 'admin' }, attributes: ['id'] });
  for (const admin of admins) {
    await notify(req, {
      userId: admin.id,
      title: 'A user was reported',
      body: `${reported.name} was reported (${reason.replace('_', ' ')}). Review it under People & trust › Reports.`,
      category: 'activity',
    });
  }

  // The reporter learns only that it arrived; who reported is never shown to the reported user.
  res.status(201).json({ id: report.id, status: report.status });
};

/** Admin: every report, open ones first, with both people and how often the reported user has been reported. */
export const listReports = async (_req: Request, res: Response): Promise<void> => {
  const reports = await Report.findAll({
    include: [
      { model: User, as: 'reporter', attributes: ['id', 'name', 'role'] },
      { model: User, as: 'reportedUser', attributes: ['id', 'name', 'role', 'status', 'trustScore'] },
    ],
    order: [['createdAt', 'DESC']],
  });
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.reportedUserId, (counts.get(r.reportedUserId) ?? 0) + 1);
  const rank = (s: string) => (s === 'open' ? 0 : 1);
  res.json(
    reports
      .sort((a, b) => rank(a.status) - rank(b.status))
      .map((r) => ({ ...r.toJSON(), timesReported: counts.get(r.reportedUserId) ?? 1 })),
  );
};

/** Admin: closes a report as actioned (something was done) or dismissed. Suspending is a separate step. */
export const resolveReport = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const status = req.body?.status;
  if (status !== 'actioned' && status !== 'dismissed') {
    res.status(400).json({ message: "status must be 'actioned' or 'dismissed'" });
    return;
  }
  const report = await Report.findByPk(pathParam(req, 'id'));
  if (!report) {
    res.status(404).json({ message: 'Report not found' });
    return;
  }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, NOTE_MAX) || null : null;
  await report.update({ status, resolvedBy: caller.id, resolvedAt: new Date(), resolutionNote: note });
  await notify(req, {
    userId: report.reporterId,
    title: 'Your report was reviewed',
    body:
      status === 'actioned'
        ? 'An admin reviewed your report and took action. Thank you for keeping Isoko safe.'
        : 'An admin reviewed your report and did not find a reason to act. If something else happens, report it again.',
    category: 'activity',
  });
  res.json(report);
};
