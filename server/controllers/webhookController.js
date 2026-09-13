const crypto = require('crypto');
const { Match, Gig, User } = require('../models');
const paymentService = require('../services/paymentService');
const notify = require('../lib/notify');

/**
 * Compares two secrets without leaking their difference through timing.
 *
 * A webhook endpoint is public, so a naive === lets an attacker recover the
 * secret one character at a time by measuring how long rejection takes.
 */
const secretMatches = (provided, expected) => {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Receives a provider's payment callback.
 *
 * Providers retry until they see a 200, so this answers 200 for anything it has
 * already handled — a duplicate is a success, not an error. Returning 4xx to a
 * repeat would make the provider retry harder and, worse, could leave a
 * genuinely settled payment looking unsettled on their side.
 */
exports.paymentCallback = async (req, res) => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (expected && !secretMatches(req.get('X-Webhook-Secret'), expected)) {
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  const provider = req.params.provider;
  const { providerReference, status, failureReason, raw } = req.body ?? {};

  if (!providerReference || !status) {
    return res.status(400).json({ message: 'providerReference and status are required' });
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
    return res.status(200).json({ received: true, applied: false, reason: result.reason });
  }

  if (result.duplicate) {
    return res.status(200).json({
      received: true,
      applied: false,
      duplicate: true,
      status: result.transaction.status,
    });
  }

  // Only a first-time settlement notifies, so a retried webhook cannot tell a
  // worker twice that they have been paid.
  const match = await Match.findByPk(result.transaction.matchId, {
    include: [{ model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] }],
  });
  if (match) {
    const confirmed = result.transaction.status === 'confirmed';
    await notify(req, {
      userId: match.workerId,
      title: confirmed ? 'Payment confirmed' : 'Payment failed',
      body: confirmed
        ? `Payment for "${match.gig.title}" was confirmed (${result.transaction.amount} ${result.transaction.currency}).`
        : `Payment for "${match.gig.title}" did not go through. ${result.transaction.failureReason ?? ''}`.trim(),
    });
  }

  res.status(200).json({
    received: true,
    applied: true,
    status: result.transaction.status,
  });
};
