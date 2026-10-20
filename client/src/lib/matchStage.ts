import type { Match, Role } from '../types';

/**
 * Where a job stands, as the "Your matches" list groups it.
 *
 * The match status alone is not enough: a completed job is either still
 * waiting for its Mobile Money payment or paid, and those need different
 * things from the client.
 */
export type MatchStage = 'invited' | 'in_progress' | 'awaiting_payment' | 'paid' | 'closed';

export const MATCH_STAGES: MatchStage[] = ['invited', 'in_progress', 'awaiting_payment', 'paid', 'closed'];

export const stageOf = (m: Pick<Match, 'status' | 'transaction'>): MatchStage => {
  if (m.status === 'cancelled') return 'closed';
  if (m.status === 'pending') return 'invited';
  if (m.status === 'accepted') return 'in_progress';
  return m.transaction?.status === 'confirmed' ? 'paid' : 'awaiting_payment';
};

/** The one thing a job is waiting for the viewer to do, if anything. */
export type MatchAction = 'confirm' | 'markDone' | 'pay' | 'review';

export interface Viewer {
  id: string;
  role: Role | null;
}

export const actionFor = (
  m: Pick<Match, 'status' | 'transaction' | 'workerId' | 'workDoneAt' | 'reviews'>,
  viewer: Viewer,
  { liveDispute = false }: { liveDispute?: boolean } = {},
): MatchAction | null => {
  const isWorker = viewer.role === 'worker';
  // Crew and apprentices see the job, but answering, paying and reviewing are the lead's.
  if (isWorker && m.workerId !== viewer.id) return null;
  // While a dispute is open the mediators decide; nothing on the card is the viewer's move.
  if (liveDispute) return null;
  switch (stageOf(m)) {
    case 'invited':
      return isWorker ? 'confirm' : null;
    case 'in_progress':
      return !isWorker && m.workDoneAt ? 'markDone' : null;
    case 'awaiting_payment':
      // A request already with MTN is waiting on the payer's phone, not on the screen.
      return !isWorker && m.transaction?.status !== 'initiated' ? 'pay' : null;
    case 'paid':
      return m.reviews?.some((r) => r.authorId === viewer.id) ? null : 'review';
    default:
      return null;
  }
};

export const amountOf = (m: Pick<Match, 'agreedAmount' | 'gig'>): number => Number(m.agreedAmount ?? m.gig?.budget ?? 0);

export type MatchSort = 'action' | 'recent' | 'oldest' | 'amountHigh' | 'amountLow';
export const MATCH_SORTS: MatchSort[] = ['action', 'recent', 'oldest', 'amountHigh', 'amountLow'];

const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);

/**
 * Orders a list without changing it. "action" (the default) puts what is
 * waiting on the viewer first, then follows a job's life (invited, under way,
 * awaiting payment, paid, closed), most recent first within each.
 */
export const sortMatches = <M extends Match>(list: M[], sort: MatchSort, needsYou: (m: M) => boolean): M[] => {
  const recent = (a: M, b: M) => time(b.updatedAt) - time(a.updatedAt);
  const by: Record<MatchSort, (a: M, b: M) => number> = {
    action: (a, b) =>
      Number(needsYou(b)) - Number(needsYou(a)) ||
      MATCH_STAGES.indexOf(stageOf(a)) - MATCH_STAGES.indexOf(stageOf(b)) ||
      recent(a, b),
    recent,
    oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
    amountHigh: (a, b) => amountOf(b) - amountOf(a) || recent(a, b),
    amountLow: (a, b) => amountOf(a) - amountOf(b) || recent(a, b),
  };
  return [...list].sort(by[sort]);
};

/** Whether a job matches a search by its title or the other person's name. */
export const matchesSearch = (m: Pick<Match, 'gig' | 'worker'>, query: string, role: Role | null): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const other = role === 'worker' ? m.gig?.client?.name : m.worker?.name;
  return [m.gig?.title, other].some((s) => s?.toLowerCase().includes(q));
};
