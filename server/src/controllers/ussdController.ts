import type { Request, Response } from 'express';
import { User } from '../models';
import * as ussd from '../services/ussdService';
import { authed } from '../lib/authed';
import { secretMatches } from '../lib/secrets';
import { toRwandanMsisdn } from '../lib/channels/sms';

const providedSecret = (req: Request) =>
  req.get('X-Webhook-Secret') ?? (typeof req.query.secret === 'string' ? req.query.secret : undefined);

/**
 * The USSD gateway's callback (Africa's Talking format: sessionId,
 * serviceCode, phoneNumber, text; reply in plain text starting CON or END).
 *
 * The caller's phone number is their identity, so the gateway must prove
 * itself with the shared secret; in production a missing secret refuses
 * everything rather than letting anyone claim to be any number.
 */
export const gateway = async (req: Request, res: Response): Promise<void> => {
  const expected = process.env.USSD_WEBHOOK_SECRET;
  if (expected ? !secretMatches(providedSecret(req), expected) : process.env.NODE_ENV === 'production') {
    res.status(401).type('text/plain').send('END Not authorised');
    return;
  }
  res.type('text/plain');
  const msisdn = toRwandanMsisdn(String(req.body?.phoneNumber ?? ''));
  const worker = msisdn
    ? await User.findOne({ where: { phone: msisdn, role: 'worker', status: 'active' } })
    : null;
  // Only a number the worker confirmed with a code counts: anyone can type a number into a profile.
  if (!worker || !worker.phoneVerifiedAt) {
    res.send(ussd.unknownCaller());
    return;
  }
  res.send(await ussd.respond(req, worker, String(req.body?.text ?? '')));
};

/** The in-app simulator: the same menus, as the signed-in worker, for trying it without a phone. */
export const simulate = async (req: Request, res: Response): Promise<void> => {
  const worker = await User.findByPk(authed(req).id);
  if (!worker) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const text = String(req.body?.text ?? '');
  if (text.length > 100 || !/^[0-9*#]*$/.test(text)) {
    res.status(400).json({ message: 'Only digits, * and # can be sent' });
    return;
  }
  res.json({ screen: await ussd.respond(req, worker, text) });
};
