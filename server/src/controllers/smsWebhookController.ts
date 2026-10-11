import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { NotificationDelivery } from '../models';
import { secretMatches } from '../lib/secrets';
import type { DeliveryStatus } from '../types/domain';

/**
 * Pindo's delivery report statuses, mapped onto ours.
 *
 * ACCEPTED and UNKNOWN are not outcomes -- the carrier has the message, or has
 * not said -- so they update the raw status and leave ours as it was.
 */
const OUTCOMES: Record<string, DeliveryStatus | null> = {
  DELIVRD: 'delivered',
  UNDELIV: 'failed',
  REJECTED: 'failed',
  EXPIRED: 'failed',
  ACCEPTED: null,
  UNKNOWN: null,
};

/**
 * The shared secret, from a header if the gateway can set one, otherwise from
 * the query string of the callback URL configured in its dashboard.
 */
const providedSecret = (req: Request): string | undefined =>
  req.get('X-Webhook-Secret') ?? (typeof req.query.secret === 'string' ? req.query.secret : undefined);

/**
 * Receives Pindo's delivery report (DLR) for one message.
 *
 * Answers 200 to anything it cannot place. Pindo documents no retries, so a
 * 4xx gains nothing, and a report for a message this database never recorded
 * -- one sent from the dashboard, say -- is not an error worth surfacing.
 *
 * Reports can arrive out of order. An outcome, once recorded, is never replaced
 * by a non-outcome: a late ACCEPTED must not turn `delivered` back into `sent`.
 */
export const pindoDeliveryReport = async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.SMS_WEBHOOK_SECRET;
  // Unset is tolerated in development, as the payment webhook does, so the
  // flow can be tried locally. In production it would let anyone rewrite
  // delivery records, so there it is required.
  if (expected ? !secretMatches(providedSecret(req), expected) : process.env.NODE_ENV === 'production') {
    res.status(401).json({ message: 'Invalid webhook secret' });
    return;
  }

  const { sms_id: smsId, status } = req.body ?? {};
  if (!smsId || typeof status !== 'string') {
    res.status(400).json({ message: 'sms_id and status are required' });
    return;
  }

  const row = await NotificationDelivery.findOne({
    where: { provider: 'pindo', providerMessageId: String(smsId), channel: 'sms' },
  });
  if (!row) {
    res.json({ received: true, matched: false });
    return;
  }

  const providerStatus = status.toUpperCase();
  const outcome = OUTCOMES[providerStatus] ?? null;
  const updates: Partial<{
    providerStatus: string;
    status: DeliveryStatus;
    deliveredAt: Date;
    error: string;
  }> = {};

  const settled = row.status === 'delivered' || row.status === 'failed';
  if (!(settled && outcome === null)) {
    updates.providerStatus = providerStatus;
  }
  if (outcome === 'delivered') {
    updates.status = 'delivered';
    // Time of receipt, not the report's modified_at: Pindo sends that without
    // a timezone, and a report follows delivery by seconds.
    updates.deliveredAt = new Date();
  } else if (outcome === 'failed') {
    updates.status = 'failed';
    updates.error = `carrier: ${providerStatus}`;
  }

  if (Object.keys(updates).length > 0) {
    await NotificationDelivery.update(updates, {
      where: { id: row.id, status: { [Op.ne]: 'skipped' } },
    });
  }

  res.json({ received: true, matched: true, status: updates.status ?? row.status });
};
