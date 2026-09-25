import type { Request } from 'express';
import type { Server } from 'socket.io';

/**
 * The Socket.IO server, stashed on the app in server.ts.
 *
 * `app.get(name)` is typed as returning any, so reaching the server through
 * one helper keeps that cast in a single place instead of repeating it at
 * every call site.
 */
export const ioFrom = (req?: Pick<Request, 'app'>): Server | undefined =>
  req?.app?.get('io') as Server | undefined;
