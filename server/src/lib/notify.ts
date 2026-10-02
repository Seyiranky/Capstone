import type { Request } from 'express';
import { Notification, NotificationDelivery, User } from '../models';
import * as sms from './channels/sms';
import { ioFrom } from './io';
import type { DeliveryChannel, DeliveryStatus } from '../types/domain';

interface NotificationFields {
  userId: string;
  title: string;
  body: string;
}

interface DeliveryRecord {
  status: DeliveryStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  sentAt?: Date;
}

// In-app is the default channel for everyone and is never opted out of; SMS is
// additional and only for those who asked for it. FR-13 words it that way, and
// it also means a notification is never lost because a phone was unreachable.
const recordDelivery = (
  notificationId: string,
  channel: DeliveryChannel,
  fields: DeliveryRecord,
) =>
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
const deliverSms = async (notification: Notification, user: User | null) => {
  if (user?.preferredChannel !== 'sms') {
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
      error: error instanceof Error ? error.message : String(error),
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
const notify = async (
  req: Pick<Request, 'app'> | undefined,
  fields: NotificationFields,
  { channels = ['in_app', 'sms'] }: { channels?: DeliveryChannel[] } = {},
): Promise<Notification> => {
  const notification = await Notification.create(fields);

  if (channels.includes('in_app')) {
    try {
      const io = ioFrom(req);
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
      attributes: ['id', 'phone', 'preferredChannel'],
    });
    // Deliberately not awaited.
    void deliverSms(notification, user);
  }

  return notification;
};

/**
 * Exported with `export =` rather than a default export on purpose.
 *
 * This module has always been `module.exports = notify` — a bare function —
 * and eighteen call sites do `require('../lib/notify')` expecting exactly
 * that. A default export would compile to `exports.default` and every one of
 * them would call undefined. `export =` emits the same CommonJS shape, while
 * `import notify from './lib/notify'` still works under esModuleInterop.
 */
export = notify;
