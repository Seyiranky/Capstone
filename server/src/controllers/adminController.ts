import type { Request, Response } from 'express';
import * as rateService from '../services/rateService';
import * as applicationOversight from '../services/applicationOversight';
import * as safeVisitService from '../services/safeVisitService';
import * as pilotMetricsService from '../services/pilotMetricsService';
import * as collusionDetectionService from '../services/collusionDetectionService';
import * as gigModerationService from '../services/gigModerationService';
import * as userAdminService from '../services/userAdminService';
import * as adminReportService from '../services/adminReportService';
import { authed } from '../lib/authed';
import { pathParam, stringParam } from '../lib/query';
import type { ReviewerTier } from '../types/domain';

/*
 * The admin area over HTTP. Each handler checks the request and hands it to
 * the service for that area: gigModerationService, userAdminService,
 * adminReportService, applicationOversight, safeVisitService and the rest.
 */

// People

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  res.json(await userAdminService.listUsers());
};

export const listReviewers = async (_req: Request, res: Response): Promise<void> => {
  res.json(await userAdminService.listReviewers());
};

/** Enrols or removes a skill reviewer. */
export const setReviewerTier = async (req: Request, res: Response): Promise<void> => {
  const { reviewerTier } = req.body ?? {};
  if (![null, 'admin', 'peer'].includes(reviewerTier ?? null)) {
    res.status(400).json({ message: "reviewerTier must be 'admin', 'peer' or null" });
    return;
  }
  res.json(
    await userAdminService.setReviewerTier(req, pathParam(req, 'id'), (reviewerTier ?? null) as ReviewerTier | null),
  );
};

export const moderateUser = async (req: Request, res: Response): Promise<void> => {
  const { action } = req.body ?? {};
  if (!['suspend', 'activate'].includes(action)) {
    res.status(400).json({ message: "action must be 'suspend' or 'activate'" });
    return;
  }
  res.json(await userAdminService.moderate(req, authed(req).id, pathParam(req, 'id'), action));
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  await userAdminService.remove(authed(req).id, pathParam(req, 'id'));
  res.json({ message: 'User deleted' });
};

/** Reviewer-integrity flags: collusion patterns and recusals (RQ1). */
export const listFlagged = async (_req: Request, res: Response): Promise<void> => {
  res.json(await collusionDetectionService.report());
};

// Gigs

export const listGigs = async (_req: Request, res: Response): Promise<void> => {
  res.json(await gigModerationService.listAll());
};

export const reviewGig = async (req: Request, res: Response): Promise<void> => {
  const { decision, note } = req.body ?? {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    return;
  }
  // An optional reason for a rejection, passed to the client so they can fix and repost.
  const reason = typeof note === 'string' ? note.trim().slice(0, 280) : '';

  const { gig, invitations } = await gigModerationService.decide(req, pathParam(req, 'id'), {
    decision,
    reason,
    sensitive: req.body?.sensitive,
  });
  res.json({ ...gig.toJSON(), invitations });
};

export const setGigSensitive = async (req: Request, res: Response): Promise<void> => {
  res.json(await gigModerationService.setSensitive(pathParam(req, 'id'), req.body?.sensitive));
};

// Applications

/** Applications that need an admin's look: overdue, on sensitive gigs, or flagged. */
export const applicationsOverview = async (req: Request, res: Response): Promise<void> => {
  res.json(await applicationOversight.overview({ all: req.query.all === '1' }));
};

export const applicationsFlaggedCount = async (_req: Request, res: Response): Promise<void> => {
  res.json({ count: await applicationOversight.flaggedCount() });
};

export const withdrawApplication = async (req: Request, res: Response): Promise<void> => {
  res.json(await applicationOversight.withdraw(req, pathParam(req, 'id'), req.body?.reason));
};

// Reports

export const pilotMetrics = async (req: Request, res: Response): Promise<void> => {
  const from = stringParam(req, 'from');
  const to = stringParam(req, 'to');
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    res.status(400).json({ message: 'from and to must be valid dates' });
    return;
  }
  res.json(
    await pilotMetricsService.collect({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    }),
  );
};

export const smsHealth = async (_req: Request, res: Response): Promise<void> => {
  res.json(await adminReportService.smsHealth());
};

export const rejectionReasons = async (_req: Request, res: Response): Promise<void> => {
  res.json(await adminReportService.rejectionReasons());
};

export const payments = async (_req: Request, res: Response): Promise<void> => {
  res.json(await adminReportService.payments());
};

export const rates = async (_req: Request, res: Response): Promise<void> => {
  res.json(await rateService.forAllTrades());
};

// Safety

export const safetyAlerts = async (_req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.alerts());
};

export const resolveSafetyAlert = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.resolve(req, pathParam(req, 'id'), authed(req).id, req.body?.note));
};

export const acknowledgeSafetyAlert = async (req: Request, res: Response): Promise<void> => {
  res.json(await safeVisitService.acknowledge(req, pathParam(req, 'id'), authed(req).id));
};

export const openSafetyAlerts = async (_req: Request, res: Response): Promise<void> => {
  res.json({ count: await safeVisitService.openCount() });
};
