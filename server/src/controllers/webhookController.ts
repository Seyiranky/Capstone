import type { Request, Response } from 'express';
import { Match, Gig, User } from '../models';
import * as paymentService from '../services/paymentService';
import notify from '../lib/notify';
import { paymentNotice } from '../lib/paymentNotice';
import { pathParam } from '../lib/query';
import { secretMatches } from '../lib/secrets';

/**
 * Receives a provider's payment callback.
 *
 * Providers retry until they see a 200, so this answers 200 for anything it has
 * already handled — a duplicate is a success, not an error. Returning 4xx to a
 * repeat would make the provider retry harder and, worse, could leave a
 * genuinely settled payment looking unsettled on their side.
 */
export const paymentCallback = async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  // Without a secret only a development server accepts callbacks: in
  // production an unauthenticated callback could mark any payment as paid.
  if (expected ? !secretMatches(req.get('X-Webhook-Secret'), expected) : process.env.NODE_ENV === 'production') {
    res.status(401).json({ message: 'Invalid webhook signature' });
    return;
  }

  const provider = pathParam(req, 'provider');
  const { providerReference, status, failureReason, raw } = req.body ?? {};

  if (!providerReference || !status) {
    res.status(400).json({ message: 'providerReference and status are required' });
    return;
  }

  const result = await paymentService.applyCallback({
    provider,
    providerReference,
    status,
    failureReason,
    raw,
  });

  if (!result.ok) {
    // Still a 200: an unrecognised reference is not something the provider can
    // fix by retrying, and holding their queue open helps nobody.
    res.status(200).json({ received: true, applied: false, reason: result.reason });
    return;
  }

  if (result.duplicate) {
    res.status(200).json({
      received: true,
      applied: false,
      duplicate: true,
      status: result.transaction.status,
    });
    return;
  }

  // Only a first-time settlement notifies, so a retried webhook cannot tell a
  // worker twice that they have been paid.
  const match = (await Match.findByPk(result.transaction.matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] }],
  })) as (Match & { gig?: Gig | null }) | null;
  if (match) {
    await notify(req, paymentNotice(result.transaction, match));
  }

  res.status(200).json({
    received: true,
    applied: true,
    status: result.transaction.status,
  });
};
