const { Notification, NotificationDelivery, User } = require('../models');
const sms = require('./channels/sms');

// In-app is the default channel for everyone and is never opted out of; SMS is
// additional and only for those who asked for it. FR-13 words it that way, and
// it also means a notification is never lost because a phone was unreachable.
const recordDelivery = (notificationId, channel, fields) =>
  NotificationDelivery.create({ notificationId, channel, ...fields }).catch(() => {
    /* bookkeeping must never break the thing it is recording */
  });

/**
 * Sends SMS when the recipient has opted in and given a number.
 *
 * Every outcome is recorded, including the ones where nothing was sent. A
 * pilot reporting delivery needs to distinguish "they did not want SMS" from
 * "we tried and it failed", and only a row can tell them apart afterwards.
 */
const deliverSms = async (notification, user) => {
  if (!user?.smsNotificationsEnabled) {
    return recordDelivery(notification.id, 'sms', { status: 'skipped', error: 'not opted in' });
  }
  if (!user.phone) {
    return recordDelivery(notification.id, 'sms', { status: 'skipped', error: 'no phone number' });
  }

  try {
    const result = await sms.send({
      to: user.phone,
      // The body alone, without the title, keeps a message inside one segment
      // more often — which matters when each segment is separately billed.
      text: `${notification.title}: ${notification.body}`,
    });
    return recordDelivery(notification.id, 'sms', {
      status: 'sent',
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: new Date(),
    });
  } catch (error) {
    return recordDelivery(notification.id, 'sms', {
      status: 'failed',
      provider: sms.driverName(),
      error: error.message,
    });
  }
};

/**
 * Creates a notification and delivers it on every channel the user accepts.
 *
 * SMS is dispatched without blocking the caller: an HTTP request should not
 * wait on a mobile network, and a gateway timing out must not fail the action
 * that triggered it.
 */
const notify = async (req, fields, { channels = ['in_app', 'sms'] } = {}) => {
  const notification = await Notification.create(fields);

  if (channels.includes('in_app')) {
    try {
      const io = req?.app?.get('io');
      if (io) {
        io.to(fields.userId).emit('notification:new', notification);
      }
    } catch {
      /* socket delivery is best-effort */
    }
    await recordDelivery(notification.id, 'in_app', { status: 'sent', sentAt: new Date() });
  }

  if (channels.includes('sms')) {
    const user = await User.findByPk(fields.userId, {
      attributes: ['id', 'phone', 'smsNotificationsEnabled'],
    });
    // Deliberately not awaited.
    deliverSms(notification, user);
  }

  return notification;
};

module.exports = notify;
