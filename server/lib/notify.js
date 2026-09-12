const { Notification } = require('../models');

// Create a notification row and, if a Socket.IO server is attached to the
// request's app, push it live to the recipient's room.
const notify = async (req, fields) => {
  const notification = await Notification.create(fields);
  try {
    const io = req.app.get('io');
    if (io) {
      io.to(fields.userId).emit('notification:new', notification);
    }
  } catch {
    /* socket delivery is best-effort */
  }
  return notification;
};

module.exports = notify;
