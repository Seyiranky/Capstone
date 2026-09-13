import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  clearQueue,
  deadLetters,
  enqueue,
  flush,
  isQueueable,
  queueSize,
  type QueuedRequest,
} from './offlineQueue';

const httpError = (status: number) =>
  Object.assign(new Error(`request failed with ${status}`), { response: { status } });

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

beforeEach(async () => {
  await clearQueue();
});

describe('what may be replayed after a gap', () => {
  test('applying to a gig and answering an invitation are queued', () => {
    expect(isQueueable('post', '/gig-applications')).toBe(true);
    expect(isQueueable('put', '/matches/abc-123/status')).toBe(true);
    expect(isQueueable('put', '/notifications/abc-123/read')).toBe(true);
    expect(isQueueable('put', '/users/me')).toBe(true);
  });

  test('anything touching money is never queued from a device', () => {
    expect(isQueueable('post', '/transactions/initiate')).toBe(false);
    expect(isQueueable('post', '/transactions/abc-123/confirm')).toBe(false);
    expect(isQueueable('post', '/transactions/abc-123/fail')).toBe(false);
  });

  test('decisions that depend on current state are never queued', () => {
    // An admin acting on a queue that has since changed, or a review whose
    // assignment may have moved on, must not be replayed hours later.
    expect(isQueueable('put', '/skill-tasks/abc-123/review')).toBe(false);
    expect(isQueueable('put', '/gig-applications/abc-123/review')).toBe(false);
    expect(isQueueable('put', '/admin/gigs/abc-123/review')).toBe(false);
  });

  test('reads are never queued', () => {
    expect(isQueueable('get', '/gigs')).toBe(false);
  });
});

describe('capturing an action taken offline', () => {
  test('the moment the worker acted is stamped at capture, not at send', async () => {
    const before = Date.now();
    const item = await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'g1' } });
    const after = Date.now();

    const occurred = new Date(item.occurredAt).getTime();
    expect(occurred).toBeGreaterThanOrEqual(before);
    expect(occurred).toBeLessThanOrEqual(after);
    expect(await queueSize()).toBe(1);
  });

  test('queued items survive being read back', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'g1' } });
    await enqueue({ method: 'put', url: '/matches/m1/status', body: { status: 'accepted' } });
    expect(await queueSize()).toBe(2);
  });
});

describe('replaying', () => {
  test('everything sends in the order it was taken', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'g1' } });
    await enqueue({ method: 'put', url: '/matches/m1/status', body: { status: 'accepted' } });

    const sent: string[] = [];
    const result = await flush(async (item: QueuedRequest) => {
      sent.push(item.url);
    });

    expect(sent).toEqual(['/gig-applications', '/matches/m1/status']);
    expect(result.sent).toBe(2);
    expect(await queueSize()).toBe(0);
  });

  test('a server rejection is final and surfaces, rather than retrying forever', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'taken' } });

    // The gig was filled while the worker was offline. No amount of retrying
    // changes that, and silently retrying would hide it from them.
    const result = await flush(async () => {
      throw httpError(409);
    });

    expect(result.failed).toBe(1);
    expect(await queueSize()).toBe(0);
    const dead = await deadLetters();
    expect(dead).toHaveLength(1);
    expect(dead[0].dead).toBe(true);
  });

  test('a network failure keeps the item for the next attempt', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'g1' } });

    await flush(async () => {
      throw networkError();
    });

    // Still waiting, not discarded: the action was never delivered.
    expect(await queueSize()).toBe(1);
    expect(await deadLetters()).toHaveLength(0);
  });

  test('an item that keeps failing eventually stops and is shown to the worker', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'g1' } });

    for (let i = 0; i < 6; i += 1) {
      await flush(async () => {
        throw networkError();
      });
    }

    expect(await queueSize()).toBe(0);
    expect(await deadLetters()).toHaveLength(1);
  });

  test('one failure does not block the rest of the queue', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'taken' } });
    await enqueue({ method: 'put', url: '/matches/m1/status', body: { status: 'accepted' } });

    const sent: string[] = [];
    await flush(async (item) => {
      if (item.url === '/gig-applications') throw httpError(409);
      sent.push(item.url);
    });

    expect(sent).toEqual(['/matches/m1/status']);
  });

  test('a dead item is not retried on the next flush', async () => {
    await enqueue({ method: 'post', url: '/gig-applications', body: { gigId: 'taken' } });
    await flush(async () => {
      throw httpError(409);
    });

    let attempts = 0;
    await flush(async () => {
      attempts += 1;
    });

    expect(attempts).toBe(0);
  });
});
