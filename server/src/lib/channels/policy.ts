import type { DeliveryChannel, NotificationCategory } from '../../types/domain';

/**
 * Which channels a kind of notice deserves.
 *
 * Transport is a property of the notice, not of the controller reporting it: a
 * controller knows that a payment settled, and should not also have to know
 * that this is worth an email while a routine fan-out to admins is not.
 * Keeping the mapping here means the fan-out can be narrowed in one place.
 *
 * `activity` is the default and stays in the app. It used to go by SMS as
 * well, which cost nothing on the log driver; on a live gateway every message
 * is billed, and routine notices -- a new application fanned out to every
 * admin, a review left -- are not worth interrupting someone's phone for.
 *
 * `outcome` and `critical` resolve identically today. They stay distinct so
 * that SMS can be narrowed to `critical` alone if pilot spend calls for it.
 */
const POLICY: Record<NotificationCategory, DeliveryChannel[]> = {
  activity: ['in_app'],
  outcome: ['in_app', 'sms', 'email'],
  critical: ['in_app', 'sms', 'email'],
};

export const channelsFor = (
  category: NotificationCategory = 'activity',
): DeliveryChannel[] => POLICY[category] ?? POLICY.activity;
