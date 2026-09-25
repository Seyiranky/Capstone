import { Op } from 'sequelize';
import { Match, Gig, SkillTask, User } from '../models';
import { PEER_MIN_REVIEWS } from './skillVerificationService';
import * as allocationService from './allocationService';
import type { AllocationStatus } from './allocationService';

const HOUR_MS = 1000 * 60 * 60;

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export interface Summary {
  n: number;
  meanHours: number | null;
  medianHours: number | null;
}

const summarise = (values: number[]): Summary => ({
  n: values.length,
  meanHours: mean(values),
  medianHours: median(values),
});

export interface Acceptance {
  total: number;
  awaitingResponse: number;
  withdrawnOrSuperseded: number;
  responded: number;
  accepted: number;
  declined: number;
  acceptanceRate: number | null;
  responseTime: Summary;
  responseTimeActioned: Summary;
  queuedOffline: number;
}

/**
 * Acceptance rate counts only matches the worker themselves answered.
 *
 * respondedAt is set only by a worker acting on their own match, so three
 * groups are excluded from the denominator, each for a different reason:
 * matches still pending (no answer yet), matches withdrawn by the client, and
 * invitations superseded when another worker took the gig. Counting any of
 * those as declines would understate how willing workers are to accept.
 */
const acceptanceFor = (matches: Match[]): Acceptance => {
  const responded = matches.filter((match) => match.respondedAt);
  const accepted = responded.filter((match) => match.acceptedAt);
  const awaiting = matches.filter((match) => match.status === 'pending');
  return {
    total: matches.length,
    awaitingResponse: awaiting.length,
    withdrawnOrSuperseded: matches.length - responded.length - awaiting.length,
    responded: responded.length,
    accepted: accepted.length,
    declined: responded.length - accepted.length,
    acceptanceRate: responded.length ? accepted.length / responded.length : null,
    responseTime: summarise(
      responded.map(
        (match) => ((match.respondedAt as Date).getTime() - match.createdAt.getTime()) / HOUR_MS,
      ),
    ),
    // Server time measures when the platform heard; actioned time measures when
    // the worker decided. They diverge exactly as much as connectivity did, so
    // reporting only the first would attribute network delay to hesitation.
    responseTimeActioned: summarise(
      responded.map(
        (match) =>
          ((match.respondedOccurredAt ?? (match.respondedAt as Date)).getTime() -
            match.createdAt.getTime()) /
          HOUR_MS,
      ),
    ),
    queuedOffline: matches.filter((match) => match.wasQueuedOffline).length,
  };
};

const groupBy = <T>(items: T[], keyOf: (item: T) => string | null | undefined): Record<string, T[]> =>
  items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyOf(item) ?? 'none';
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

const mapValues = <T, R>(obj: Record<string, T>, fn: (value: T) => R): Record<string, R> =>
  Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, fn(value)]));

export interface NewcomerAccess {
  threshold: { reviewsBelow: number };
  newcomers: number;
  establishedWorkers: number;
  invitations: {
    total: number;
    toNewcomers: number;
    share: number | null;
    byReason: { ranked: number; exploration: number };
  };
  acceptedMatches: { total: number; byNewcomers: number; share: number | null };
  newcomersNeverInvited: number;
}

/**
 * Whether workers without a track record are actually being reached.
 *
 * Credentials and trust both require completed work, and completed work
 * requires being invited, so ranking alone converges on the same few people.
 * A starved pilot is otherwise invisible until the write-up, by which point
 * the data has already been collected from a handful of participants.
 */
const newcomerAccess = async (matches: Match[]): Promise<NewcomerAccess> => {
  const workers = await User.findAll({
    where: { role: 'worker', status: 'active' },
    attributes: ['id', 'name', 'reviewCount'],
  });
  const newcomerIds = new Set(
    workers.filter((w) => (w.reviewCount ?? 0) < PEER_MIN_REVIEWS).map((w) => w.id),
  );

  const invitations = matches.filter((m) => m.origin === 'ranked');
  const toNewcomers = invitations.filter((m) => newcomerIds.has(m.workerId));
  const accepted = matches.filter((m) => m.acceptedAt);
  const acceptedByNewcomers = accepted.filter((m) => newcomerIds.has(m.workerId));

  const everInvited = new Set(invitations.map((m) => m.workerId));
  const neverInvited = [...newcomerIds].filter((id) => !everInvited.has(id));

  return {
    threshold: { reviewsBelow: PEER_MIN_REVIEWS },
    newcomers: newcomerIds.size,
    establishedWorkers: workers.length - newcomerIds.size,
    invitations: {
      total: invitations.length,
      toNewcomers: toNewcomers.length,
      share: invitations.length ? toNewcomers.length / invitations.length : null,
      // Split out, because a reserved slot reaching a newcomer says nothing
      // about whether the ranking would have.
      byReason: {
        ranked: toNewcomers.filter((m) => m.invitationReason === 'ranked').length,
        exploration: toNewcomers.filter((m) => m.invitationReason === 'exploration').length,
      },
    },
    acceptedMatches: {
      total: accepted.length,
      byNewcomers: acceptedByNewcomers.length,
      share: accepted.length ? acceptedByNewcomers.length / accepted.length : null,
    },
    // The number to watch: newcomers the platform has never put in front of
    // anyone.
    newcomersNeverInvited: neverInvited.length,
  };
};

export interface PilotMetrics {
  window: { from: string | Date | null; to: string | Date | null };
  matchAcceptance: {
    overall: Acceptance;
    byOrigin: Record<string, Acceptance>;
    byInvitationReason: Record<string, Acceptance>;
    byWeightProfile: Record<string, Acceptance>;
  };
  newcomerAccess: NewcomerAccess;
  experimentAllocation: AllocationStatus;
  timeToFirstMatch: {
    gigsOpened: number;
    openedNeverMatched: number;
    toFirstMatch: Summary;
    toFirstAcceptedMatch: Summary;
  };
  skillReviewTurnaround: {
    submitted: number;
    pending: number;
    approved: number;
    rejected: number;
    turnaround: Summary;
  };
}

export const collect = async ({
  from,
  to,
}: { from?: string | Date; to?: string | Date } = {}): Promise<PilotMetrics> => {
  const createdAt: Record<symbol, unknown> = {};
  if (from) createdAt[Op.gte] = from;
  if (to) createdAt[Op.lte] = to;
  const dateFilter = Object.getOwnPropertySymbols(createdAt).length ? { createdAt } : {};

  const matches = await Match.findAll({ where: dateFilter });

  // Time-to-first-match runs from the moment a gig went live (openedAt), not
  // from when it was posted, since it sits in the approval queue until then.
  const gigs = await Gig.findAll({
    where: { ...dateFilter, openedAt: { [Op.not]: null } },
    include: [{ model: Match, as: 'matches' }],
  });

  const timeToFirstMatch: number[] = [];
  const timeToFirstAccepted: number[] = [];
  let openedNeverMatched = 0;

  for (const gig of gigs) {
    const gigMatches = gig.matches || [];
    if (gigMatches.length === 0) {
      openedNeverMatched += 1;
      continue;
    }
    const firstCreated = Math.min(...gigMatches.map((m) => m.createdAt.getTime()));
    timeToFirstMatch.push((firstCreated - (gig.openedAt as Date).getTime()) / HOUR_MS);

    const acceptedTimes = gigMatches
      .filter((m) => m.acceptedAt)
      .map((m) => (m.acceptedAt as Date).getTime());
    if (acceptedTimes.length) {
      timeToFirstAccepted.push(
        (Math.min(...acceptedTimes) - (gig.openedAt as Date).getTime()) / HOUR_MS,
      );
    }
  }

  const tasks = await SkillTask.findAll({ where: dateFilter });
  const decided = tasks.filter((task) => task.status !== 'pending');
  // updatedAt approximates the decision time; SkillTaskAssignments.decidedAt
  // will make this exact once per-reviewer assignment rounds land.
  const reviewTurnaround = decided.map(
    (task) => (task.updatedAt.getTime() - task.createdAt.getTime()) / HOUR_MS,
  );

  return {
    window: { from: from || null, to: to || null },
    matchAcceptance: {
      overall: acceptanceFor(matches),
      byOrigin: mapValues(
        groupBy(matches, (m) => m.origin),
        acceptanceFor,
      ),
      // A reserved-slot invitation is not evidence the ranking chose that
      // worker, so it must never be pooled with an earned one when reporting
      // how well ranking performs.
      byInvitationReason: mapValues(
        groupBy(
          matches.filter((m) => m.invitationReason),
          (m) => m.invitationReason,
        ),
        acceptanceFor,
      ),
      byWeightProfile: mapValues(
        groupBy(matches, (m) => m.weightProfileId),
        acceptanceFor,
      ),
    },
    newcomerAccess: await newcomerAccess(matches),
    // Surfaced so arm balance and remaining capacity are visible during the
    // pilot rather than discovered when the list runs out mid-recruitment.
    experimentAllocation: await allocationService.status(),
    timeToFirstMatch: {
      gigsOpened: gigs.length,
      openedNeverMatched,
      toFirstMatch: summarise(timeToFirstMatch),
      toFirstAcceptedMatch: summarise(timeToFirstAccepted),
    },
    skillReviewTurnaround: {
      submitted: tasks.length,
      pending: tasks.length - decided.length,
      approved: decided.filter((task) => task.status === 'approved').length,
      rejected: decided.filter((task) => task.status === 'rejected').length,
      turnaround: summarise(reviewTurnaround),
    },
  };
};
