import { get, set } from 'idb-keyval';

const STORAGE_KEY = 'isoko.offline.queue';
const MAX_ATTEMPTS = 5;

export interface QueuedRequest {
  id: string;
  method: 'post' | 'put' | 'delete';
  url: string;
  body?: unknown;
  /** When the worker actually acted, as opposed to when this finally sends. */
  occurredAt: string;
  attempts: number;
  lastError?: string;
  /** Set when the server refused it outright; retrying would never help. */
  dead?: boolean;
}

/**
 * Requests safe to replay after a gap.
 *
 * The rule is not "which requests are convenient" but "which are still correct
 * when they arrive hours late". Applying to a gig and answering an invitation
 * both are: worst case the gig is gone and the server says so. Anything whose
 * meaning depends on the state at the moment of arrival is excluded —
 * completing a match could race a cancellation through the state machine, an
 * admin decision could act on a queue that has since changed, and a payment
 * must never be replayed from a device at all.
 */
const QUEUEABLE: { method: string; pattern: RegExp }[] = [
  { method: 'post', pattern: /^\/gig-applications$/ },
  { method: 'put', pattern: /^\/matches\/[^/]+\/status$/ },
  { method: 'put', pattern: /^\/notifications\/[^/]+\/read$/ },
  { method: 'put', pattern: /^\/users\/me$/ },
];

export const isQueueable = (method: string, url: string): boolean => {
  const path = url.split('?')[0];
  return QUEUEABLE.some((rule) => rule.method === method.toLowerCase() && rule.pattern.test(path));
};

const read = async (): Promise<QueuedRequest[]> => (await get(STORAGE_KEY)) ?? [];
const write = (queue: QueuedRequest[]) => set(STORAGE_KEY, queue);

export const queueSize = async () => (await read()).filter((item) => !item.dead).length;
export const deadLetters = async () => (await read()).filter((item) => item.dead);
export const clearQueue = () => write([]);

export const enqueue = async (
  entry: Omit<QueuedRequest, 'id' | 'attempts' | 'occurredAt'> & { occurredAt?: string },
): Promise<QueuedRequest> => {
  const queue = await read();
  const item: QueuedRequest = {
    id: crypto.randomUUID(),
    attempts: 0,
    // Stamped here, not on arrival, so the server can tell when the worker
    // decided rather than when the network came back.
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
    ...entry,
  };
  queue.push(item);
  await write(queue);
  return item;
};

type Sender = (item: QueuedRequest) => Promise<void>;

let flushing = false;

/**
 * Replays queued requests, oldest first.
 *
 * Sequential rather than parallel: two of these can concern the same gig, and
 * an application replayed before the invitation it answers would produce a
 * confusing pair of records.
 *
 * A 4xx is terminal. The gig was filled, or the invitation expired — retrying
 * cannot change that, and quietly retrying forever would hide it from the
 * worker. Those move to a dead-letter list the UI can show, rather than
 * vanishing.
 */
export const flush = async (send: Sender): Promise<{ sent: number; failed: number }> => {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;

  try {
    let queue = await read();
    const remaining: QueuedRequest[] = [];
    let sent = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.dead) {
        remaining.push(item);
        continue;
      }

      try {
        await send(item);
        sent += 1;
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        const message = (error as Error)?.message ?? 'request failed';

        if (status && status >= 400 && status < 500) {
          remaining.push({ ...item, dead: true, lastError: message });
          failed += 1;
          continue;
        }

        // Never reached the server (offline, or the server was down): try again
        // later without using up an attempt, or a long outage would bury the action.
        if (!status) {
          remaining.push({ ...item, lastError: message });
          continue;
        }

        const attempts = item.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          remaining.push({ ...item, attempts, dead: true, lastError: message });
          failed += 1;
        } else {
          remaining.push({ ...item, attempts, lastError: message });
        }
      }
    }

    queue = remaining;
    await write(queue);
    return { sent, failed };
  } finally {
    flushing = false;
  }
};

export const discard = async (id: string) => {
  await write((await read()).filter((item) => item.id !== id));
};

export const MAX_QUEUE_ATTEMPTS = MAX_ATTEMPTS;
