const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { User } = require('./models');

// Attaches a Socket.IO server to the given HTTP server. Every socket is
// authenticated with the same JWT the REST API uses (sent by the client as
// `handshake.auth.token`) and joined to a room named after its user id, so
// controllers can push events to a specific person with `io.to(userId)`.
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use(async (socket, next) => {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      return next(new Error('No token provided'));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(new Error('Invalid or expired token'));
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return next(new Error('Invalid or expired token'));
    }
    if (user.status === 'suspended') {
      return next(new Error('Account suspended'));
    }

    socket.userId = decoded.id;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(socket.userId);
  });

  return io;
};

module.exports = { initSocket };
