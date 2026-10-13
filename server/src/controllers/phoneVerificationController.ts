import { Op } from 'sequelize';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { User } from '../models/User';
import * as sms from '../lib/channels/sms';
import { authed } from '../lib/authed';

/**
 * Confirming a phone number before SMS notifications are sent to it.
 *
 * The same shape as email confirmation in authController -- a short-lived
 * secret, a resend cooldown, single use -- with a six-digit code in place of a
 * link, because a code is typed on the phone that received it and a link would
 * need the browser and the SMS on the same device.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

// Salted with the user id so that one hash cannot be looked up in a table of
// all million six-digit codes and reused for another account.
const hashCode = (userId: string, code: string) =>
  crypto.createHash('sha256').update(`${userId}:${code}`).digest('hex');

const sameHash = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Stores the number and texts a code to it.
 *
 * Sent straight through the SMS channel rather than through notify(): like the
 * email confirmation link, this is the message that decides whether the channel
 * can be used at all, so it goes whatever the user's preference says.
 *
 * The code is never in the response. On the `log` driver it is printed by the
 * server, which is how the flow is demonstrated without a gateway account.
 */
/**
 * A confirmed number belongs to one account. Notices and safety texts go to
 * it, so two accounts sharing one would let either be reached as the other.
 */
const confirmedElsewhere = (msisdn: string, userId: string) =>
  User.findOne({ where: { phone: msisdn, phoneVerifiedAt: { [Op.ne]: null }, id: { [Op.ne]: userId } }, attributes: ['id'] });

const TAKEN = 'This number is already confirmed on another Isoko account.';

export const sendPhoneCode = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const msisdn = sms.toRwandanMsisdn((req.body ?? {}).phone);
  if (!msisdn) {
    res.status(400).json({
      message: 'Enter a Rwandan mobile number: MTN (078, 079) or Airtel (072, 073).',
    });
    return;
  }

  if (await confirmedElsewhere(msisdn, caller.id)) {
    res.status(409).json({ message: TAKEN });
    return;
  }

  const user = await User.findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  // A new number is unconfirmed whatever the old one was, and any code in
  // flight belonged to the old one.
  if (user.phone !== msisdn) {
    await user.update({
      phone: msisdn,
      phoneVerifiedAt: null,
      phoneVerificationCodeHash: null,
      phoneVerificationExpiresAt: null,
      phoneVerificationAttempts: 0,
    });
  } else if (user.phoneVerifiedAt) {
    res.json({ message: 'This number is already confirmed.', verified: true });
    return;
  }

  // The expiry doubles as the record of when the last code went out, as it does
  // for email. Without a cooldown this endpoint texts a number, at our cost, as
  // fast as it is called.
  if (user.phoneVerificationExpiresAt) {
    const sentAt = user.phoneVerificationExpiresAt.getTime() - CODE_TTL_MS;
    const waited = Date.now() - sentAt;
    if (waited < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000);
      res.status(429).json({
        message: `A code was just sent. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
      return;
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await user.update({
    phoneVerificationCodeHash: hashCode(user.id, code),
    phoneVerificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    phoneVerificationAttempts: 0,
  });

  try {
    await sms.send({
      to: msisdn,
      text: `Isoko code: ${code}. It expires in 10 minutes. Do not share it with anyone.`,
    });
  } catch (error) {
    // Surfaced rather than swallowed: the user is waiting for a code, and
    // reporting success while nothing was sent leaves them stuck.
    res.status(502).json({
      message: 'Could not send the code. Try again shortly.',
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  res.json({ message: 'Code sent.', phone: msisdn, retryAfter: RESEND_COOLDOWN_MS / 1000 });
};

/**
 * Confirms the number from the code the user typed.
 *
 * Five wrong guesses spend the code, so the million possibilities cannot be
 * walked; the user asks for a new one, which the cooldown paces.
 */
export const verifyPhone = async (req: Request, res: Response): Promise<void> => {
  const caller = authed(req);
  const code = String((req.body ?? {}).code ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ message: 'Enter the 6-digit code.' });
    return;
  }

  // Unscoped: the default scope hides the hash, which is the one thing needed here.
  const user = await User.unscoped().findByPk(caller.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const expired =
    !user.phoneVerificationCodeHash ||
    !user.phoneVerificationExpiresAt ||
    user.phoneVerificationExpiresAt < new Date();
  if (expired || user.phoneVerificationAttempts >= MAX_ATTEMPTS) {
    res.status(400).json({ message: 'This code has expired. Ask for a new one.', expired: true });
    return;
  }

  if (!sameHash(hashCode(user.id, code), user.phoneVerificationCodeHash as string)) {
    const attempts = user.phoneVerificationAttempts + 1;
    await user.update({ phoneVerificationAttempts: attempts });
    const attemptsLeft = Math.max(MAX_ATTEMPTS - attempts, 0);
    res.status(400).json({
      message: attemptsLeft > 0 ? 'That code is not right.' : 'Too many tries. Ask for a new code.',
      attemptsLeft,
      expired: attemptsLeft === 0,
    });
    return;
  }

  // Checked again here: another account may have confirmed it since the code was sent.
  if (user.phone && (await confirmedElsewhere(user.phone, user.id))) {
    res.status(409).json({ message: TAKEN });
    return;
  }

  await user.update({
    phoneVerifiedAt: new Date(),
    phoneVerificationCodeHash: null,
    phoneVerificationExpiresAt: null,
    phoneVerificationAttempts: 0,
  });

  res.json({ message: 'Number confirmed. You can now receive notifications by SMS.' });
};
