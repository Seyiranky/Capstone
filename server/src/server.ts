import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { assertRequiredEnv } from './config/env';
import * as escrowService from './services/escrowService';

// Fails here rather than at the first request that needs a secret. Without
// this the server boots happily with no JWT_SECRET and only falls over when
// somebody tries to log in.
assertRequiredEnv();

const PORT = Number(process.env.PORT) || 4000;

const server = http.createServer(app);
const io = initSocket(server);

// Make the Socket.IO instance reachable from controllers via req.app.get('io').
app.set('io', io);

// Releases escrow for jobs reported done more than 72 hours ago. Every 10
// minutes is plenty against a 72-hour window; unref() so it never holds the
// process open on shutdown.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
setInterval(() => {
  escrowService.releaseDue({ app }).catch((error: unknown) => {
    console.error('Escrow release sweep failed', error);
  });
}, SWEEP_EVERY_MS).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Isoko Talents API listening on port ${PORT}`);
});
