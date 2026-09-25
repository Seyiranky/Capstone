const { Notification } = require('../models');

exports.listNotifications = async (req, res) => {
  const notifications = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']],
  });
  res.json(notifications);
};

exports.markRead = async (req, res) => {
  const notification = await Notification.findOne({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  if (!notification.readAt) {
    await notification.update({ readAt: new Date() });
  }

  res.json(notification);
};
