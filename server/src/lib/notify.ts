import type { Request } from 'express';
import { Notification, NotificationDelivery, User } from '../models';
import * as sms from './channels/sms';
import * as email from './channels/email';
import { channelsFor } from './channels/policy';
import { ioFrom } from './io';
import type { DeliveryChannel, DeliveryStatus, NotificationCategory } from '../types/domain';

interface NotificationFields {
  userId: string;
  title: string;
  body: string;
  /**
   * What kind of notice this is, which decides the channels it goes out on.
   *
   * Not a column -- it is destructured out before the row is created. Omitting
   * it means `activity`: in-app and SMS, exactly what every notification did
   * before email existed.
   */
  category?: NotificationCategory;
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
 * Sends email when the recipient chose it and the address is confirmed.
 *
 * Mirrors deliverSms, including recording the outcomes where nothing was sent.
 * The unconfirmed case is its own status rather than being folded into "not
 * opted in": someone who asked for email and has not clicked the link is a
 * person to nudge, not a person who declined.
 */
const deliverEmail = async (notification: Notification, user: User | null) => {
  if (user?.preferredChannel !== 'email') {
    return recordDelivery(notification.id, 'email', { status: 'skipped', error: 'not opted in' });
  }
  if (!user.emailVerifiedAt) {
    return recordDelivery(notification.id, 'email', {
      status: 'skipped',
      error: 'email not verified',
    });
  }
  if (!user.email) {
    // Unreachable while the column is NOT NULL, but a narrowed attribute list
    // could drop it, and a silent send to undefined is worse than a row.
    return recordDelivery(notification.id, 'email', {
      status: 'skipped',
      error: 'no email address',
    });
  }

  try {
    // Title as subject, body as body -- unlike SMS, which packs both into one
    // string to stay inside a single billable segment.
    const result = await email.send({
      to: user.email,
      ...email.render(notification.title, notification.body),
    });
    return recordDelivery(notification.id, 'email', {
      status: 'sent',
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      sentAt: new Date(),
    });
  } catch (error) {
    return recordDelivery(notification.id, 'email', {
      status: 'failed',
      provider: email.driverName(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Creates a notification and delivers it on every channel the user accepts.
 *
 * Off-app channels are dispatched without blocking the caller: an HTTP request
 * should not wait on a mobile network or an SMTP handshake, and a gateway
 * timing out must not fail the action that triggered it.
 *
 * Which channels are attempted comes from the notice's category, so a caller
 * says what kind of thing happened and this decides how far it travels. An
 * explicit `channels` list still overrides that, for a caller that needs to.
 */
const notify = async (
  req: Pick<Request, 'app'> | undefined,
  fields: NotificationFields,
  { channels }: { channels?: DeliveryChannel[] } = {},
): Promise<Notification> => {
  // category is not a column; it decides transport and must not reach create().
  const { category, ...attributes } = fields;
  const targets = channels ?? channelsFor(category);
  const notification = await Notification.create(attributes);

  if (targets.includes('in_app')) {
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

  // One lookup for both off-app channels: a user has a single preference, so
  // asking twice would be two queries to answer the same question.
  const needsUser = targets.includes('sms') || targets.includes('email');
  const user = needsUser
    ? await User.findByPk(fields.userId, {
        attributes: ['id', 'phone', 'email', 'preferredChannel', 'emailVerifiedAt'],
      })
    : null;

  // Deliberately not awaited, both of them.
  if (targets.includes('sms')) {
    void deliverSms(notification, user);
  }
  if (targets.includes('email')) {
    void deliverEmail(notification, user);
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
