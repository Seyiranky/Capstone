import http from 'http';
import app from './app';
import { initSocket } from './socket';
import { assertRequiredEnv } from './config/env';

// Fails here rather than at the first request that needs a secret. Without
// this the server boots happily with no JWT_SECRET and only falls over when
// somebody tries to log in.
assertRequiredEnv();

const PORT = Number(process.env.PORT) || 4000;

const server = http.createServer(app);
const io = initSocket(server);

// Make the Socket.IO instance reachable from controllers via req.app.get('io').
app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Isoko Talents API listening on port ${PORT}`);
});
