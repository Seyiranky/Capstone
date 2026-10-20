import { describe, expect, test } from 'vitest';
import { actionFor, matchesSearch, sortMatches, stageOf } from './matchStage';
import type { Match } from '../types';

const WORKER = { id: 'w1', role: 'worker' as const };
const CLIENT = { id: 'c1', role: 'client' as const };

/** A job between WORKER and CLIENT, overridden per case. */
const job = (overrides: Partial<Match> = {}): Match =>
  ({
    id: Math.random().toString(36).slice(2),
    gigId: 'g1',
    workerId: 'w1',
    status: 'accepted',
    rankScore: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    gig: { title: 'Hem trousers', budget: 5000, client: { name: 'Grace Uwimana' } },
    worker: { name: 'Eric Niyonzima' },
    reviews: [],
    ...overrides,
  }) as Match;

const paid = { status: 'confirmed' } as Match['transaction'];

describe('stageOf', () => {
  test('a completed job is awaiting payment until the payment is confirmed', () => {
    expect(stageOf(job({ status: 'pending' }))).toBe('invited');
    expect(stageOf(job({ status: 'accepted' }))).toBe('in_progress');
    expect(stageOf(job({ status: 'completed' }))).toBe('awaiting_payment');
    expect(stageOf(job({ status: 'completed', transaction: { status: 'failed' } as Match['transaction'] }))).toBe(
      'awaiting_payment',
    );
    expect(stageOf(job({ status: 'completed', transaction: paid }))).toBe('paid');
    expect(stageOf(job({ status: 'cancelled' }))).toBe('closed');
  });
});

describe('actionFor: what the job is waiting for the viewer to do', () => {
  test('an invitation waits on the worker, not the client', () => {
    expect(actionFor(job({ status: 'pending' }), WORKER)).toBe('confirm');
    expect(actionFor(job({ status: 'pending' }), CLIENT)).toBeNull();
  });

  test('a job in progress waits on the client only once the worker says it is finished', () => {
    expect(actionFor(job(), CLIENT)).toBeNull();
    expect(actionFor(job({ workDoneAt: '2026-10-02T09:00:00Z' }), CLIENT)).toBe('markDone');
    expect(actionFor(job({ workDoneAt: '2026-10-02T09:00:00Z' }), WORKER)).toBeNull();
  });

  test('a job awaiting payment waits on the client, unless the request is already with MTN', () => {
    expect(actionFor(job({ status: 'completed' }), CLIENT)).toBe('pay');
    expect(actionFor(job({ status: 'completed', transaction: { status: 'failed' } as Match['transaction'] }), CLIENT)).toBe(
      'pay',
    );
    expect(
      actionFor(job({ status: 'completed', transaction: { status: 'initiated' } as Match['transaction'] }), CLIENT),
    ).toBeNull();
    expect(actionFor(job({ status: 'completed' }), WORKER)).toBeNull();
  });

  test('a paid job waits on whoever has not reviewed it yet', () => {
    const done = job({ status: 'completed', transaction: paid, reviews: [{ authorId: 'c1' }] as Match['reviews'] });
    expect(actionFor(done, CLIENT)).toBeNull();
    expect(actionFor(done, WORKER)).toBe('review');
  });

  test('nothing waits on crew members, or on anyone while a dispute is open', () => {
    expect(actionFor(job({ status: 'pending' }), { id: 'crew-1', role: 'worker' })).toBeNull();
    expect(actionFor(job({ status: 'completed' }), CLIENT, { liveDispute: true })).toBeNull();
  });
});

describe('sortMatches', () => {
  const a = job({ id: 'a', status: 'completed', transaction: paid, updatedAt: '2026-10-05T00:00:00Z', agreedAmount: 9000 });
  const b = job({ id: 'b', status: 'accepted', updatedAt: '2026-10-03T00:00:00Z', createdAt: '2026-09-20T00:00:00Z', agreedAmount: 2000 });
  const c = job({ id: 'c', status: 'pending', updatedAt: '2026-10-04T00:00:00Z', agreedAmount: 15000 });
  const needsYou = (m: Match) => m.id === 'a';

  test('"needs action" first, then by stage', () => {
    expect(sortMatches([b, c, a], 'action', needsYou).map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });
  test('latest activity, oldest and amount', () => {
    expect(sortMatches([b, c, a], 'recent', needsYou).map((m) => m.id)).toEqual(['a', 'c', 'b']);
    expect(sortMatches([a, c, b], 'oldest', needsYou)[0].id).toBe('b');
    expect(sortMatches([a, b, c], 'amountHigh', needsYou).map((m) => m.id)).toEqual(['c', 'a', 'b']);
    expect(sortMatches([a, b, c], 'amountLow', needsYou).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
  test('does not reorder the list it is given', () => {
    const list = [b, c, a];
    sortMatches(list, 'recent', needsYou);
    expect(list.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('matchesSearch', () => {
  test('finds by job title or the other person, ignoring case', () => {
    expect(matchesSearch(job(), 'trousers', 'client')).toBe(true);
    expect(matchesSearch(job(), 'eric', 'client')).toBe(true);
    expect(matchesSearch(job(), 'grace', 'worker')).toBe(true);
    expect(matchesSearch(job(), 'grace', 'client')).toBe(false);
    expect(matchesSearch(job(), '  ', 'client')).toBe(true);
  });
});
