import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { assertRequiredEnv } from './config/env';
import * as paymentService from './services/paymentService';
import * as disputeService from './services/disputeService';
import * as supportService from './services/supportService';
import * as applicationFollowUp from './services/applicationFollowUp';
import * as safeVisitService from './services/safeVisitService';
import * as completionService from './services/completionService';

// Fails here rather than at the first request that needs a secret. Without
// this the server boots happily with no JWT_SECRET and only falls over when
// somebody tries to log in.
assertRequiredEnv();

const PORT = Number(process.env.PORT) || 4000;

const server = http.createServer(app);
const io = initSocket(server);

// Make the Socket.IO instance reachable from controllers via req.app.get('io').
app.set('io', io);

// Settles MoMo payments whose payer approved after leaving the page (when no
// callback reached us), and hands disputes not decided in 5 days to an admin.
// unref() so it never holds the process open on shutdown.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
setInterval(() => {
  paymentService.refreshPending({ app }).catch((error: unknown) => {
    console.error('Payment status sweep failed', error);
  });
  disputeService.escalateOverdue({ app }).catch((error: unknown) => {
    console.error('Dispute escalation sweep failed', error);
  });
  safeVisitService.flagOverdue({ app }).catch((error: unknown) => {
    console.error('Safe visit sweep failed', error);
  });
  applicationFollowUp.sweep({ app }).catch((error: unknown) => {
    console.error('Application follow-up sweep failed', error);
  });
  completionService.remindWorkDone({ app }).catch((error: unknown) => {
    console.error('Work-done reminder sweep failed', error);
  });
  supportService.autoClose().catch((error: unknown) => {
    console.error('Support auto-close sweep failed', error);
  });
}, SWEEP_EVERY_MS).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Isoko API listening on port ${PORT}`);
});
