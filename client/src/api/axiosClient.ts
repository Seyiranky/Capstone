import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { enqueue, flush, isQueueable, type QueuedRequest } from '../lib/offlineQueue';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** A request that never reached the server, as opposed to one it refused. */
const isNetworkFailure = (error: AxiosError) =>
  !error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED');

export class QueuedOfflineError extends Error {
  queued = true;
  constructor(public item: QueuedRequest) {
    super('Saved. This will be sent when you are back online.');
    this.name = 'QueuedOfflineError';
  }
}

// A suspension takes effect immediately, even for someone already mid-session
// with a valid token (see server/middleware/authMiddleware.js). Catch that
// specific rejection here and force back to login rather than leaving every
// screen silently failing its API calls.
axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if ((error.response?.data as { code?: string } | undefined)?.code === 'ACCOUNT_SUSPENDED') {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    const config = error.config as InternalAxiosRequestConfig | undefined;
    const method = (config?.method ?? '').toLowerCase();
    const url = config?.url ?? '';

    // Only requests that never arrived are queued. A rejection is an answer,
    // and replaying it later would not change it.
    if (config && isNetworkFailure(error) && isQueueable(method, url)) {
      const item = await enqueue({
        method: method as QueuedRequest['method'],
        url,
        body: config.data ? safeParse(config.data) : undefined,
      });
      return Promise.reject(new QueuedOfflineError(item));
    }

    return Promise.reject(error);
  },
);

const safeParse = (data: unknown) => {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

/**
 * Sends one queued request, telling the server when it actually happened.
 *
 * occurredAt and queuedOffline travel with the body so the platform can report
 * when a worker decided as well as when it heard — otherwise a six-hour gap in
 * connectivity would be recorded as six hours of hesitation.
 */
const sendQueued = async (item: QueuedRequest) => {
  const body =
    item.body && typeof item.body === 'object'
      ? { ...(item.body as Record<string, unknown>), occurredAt: item.occurredAt, queuedOffline: true }
      : item.body;

  await axiosClient.request({
    method: item.method,
    url: item.url,
    data: body,
    // Lets the server collapse a replay that already succeeded but whose
    // response never made it back to this device.
    headers: { 'Idempotency-Key': item.id },
  });
};

export const flushOfflineQueue = () => flush(sendQueued);

/** Replays anything held while the browser was offline. */
export const startOfflineSync = () => {
  const run = () => {
    flushOfflineQueue().catch(() => {
      /* a failed flush stays queued; the next online event tries again */
    });
  };

  window.addEventListener('online', run);
  // Also on load: the browser may have been closed while items were waiting.
  if (navigator.onLine) run();

  return () => window.removeEventListener('online', run);
};

export default axiosClient;
