import type { DeliveryChannel, NotificationCategory } from '../../types/domain';

/**
 * Which channels a kind of notice deserves.
 *
 * Transport is a property of the notice, not of the controller reporting it: a
 * controller knows that a payment settled, and should not also have to know
 * that this is worth an email while a routine fan-out to admins is not.
 * Keeping the mapping here means the fan-out can be narrowed in one place.
 *
 * `activity` is the default and is exactly the channel list every call site
 * used before email existed, so an un-annotated notification is unchanged.
 *
 * `outcome` and `critical` resolve identically today. They stay distinct
 * because SMS is billed per segment once a real gateway is configured, and
 * narrowing *that* to `critical` alone is the next filter this table will need.
 */
const POLICY: Record<NotificationCategory, DeliveryChannel[]> = {
  activity: ['in_app', 'sms'],
  outcome: ['in_app', 'sms', 'email'],
  critical: ['in_app', 'sms', 'email'],
};

export const channelsFor = (
  category: NotificationCategory = 'activity',
): DeliveryChannel[] => POLICY[category] ?? POLICY.activity;
