import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { User } from './models';
import { jwtSecret } from './config/env';
import { allowedOrigins } from './middleware/security';
import { sessionStillValid } from './middleware/authMiddleware';

/**
 * The per-socket state this server keeps.
 *
 * Declared as Socket.IO's SocketData generic rather than assigned onto the
 * socket ad hoc, so `socket.data.userId` is typed everywhere it is read.
 */
export interface SocketData {
  userId: string;
}

export type IsokoServer = Server<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

// Attaches a Socket.IO server to the given HTTP server. Every socket is
// authenticated with the same JWT the REST API uses (sent by the client as
// `handshake.auth.token`) and joined to a room named after its user id, so
// controllers can push events to a specific person with `io.to(userId)`.
export const initSocket = (httpServer: HttpServer): IsokoServer => {
  const io: IsokoServer = new Server(httpServer, {
    cors: { origin: allowedOrigins() },
  });

  io.use(async (socket, next) => {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error('No token provided'));
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      return next(new Error('Invalid or expired token'));
    }

    const user = await User.findByPk(decoded.id);
    if (!user || user.status === 'deleted' || !sessionStillValid(user, decoded)) {
      return next(new Error('Invalid or expired token'));
    }
    if (user.status === 'suspended') {
      return next(new Error('Account suspended'));
    }

    socket.data.userId = decoded.id;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.userId);
  });

  return io;
};
