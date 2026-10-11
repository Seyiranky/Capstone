/**
 * SMS delivery, behind a driver so the pilot can run without a live account.
 *
 * The default driver logs instead of sending, so development, CI and the demo
 * need no account. `pindo` sends for real. Its sender name has to be approved
 * before the networks will carry it: a branded ID such as "Isoko" needs RURA
 * whitelisting (free, about five days) and separate MTN and Airtel registration
 * through the provider (about three weeks), both on an RDB company certificate.
 * Until that exists the pilot sends from Pindo's shared `PindoTest` sender, and
 * switching is SMS_SENDER_ID alone.
 */
import { segmentCount, toGsm7 } from './gsm7';

const PINDO_ENDPOINT = process.env.PINDO_ENDPOINT || 'https://api.pindo.io/v1/sms/';

export interface SmsResult {
  provider: string;
  providerMessageId: string | null;
  /** Billed segments, counted locally so every driver reports it. */
  segments: number;
  /** What the gateway charged, in its currency (USD for Pindo); null on log. */
  cost: number | null;
  /** Account balance after this message; null when the driver doesn't say. */
  balance: number | null;
}

type DriverResult = Omit<SmsResult, 'segments'>;
type SmsDriver = (message: { to: string; text: string; segments: number }) => Promise<DriverResult>;

let lastBalance: { amount: number; at: Date } | null = null;
let warnedLowBalance = false;

/** The balance the gateway last reported, kept for the admin view. */
export const lastKnownBalance = () => lastBalance;

const noteBalance = (balance: number | null) => {
  if (balance === null) return;
  lastBalance = { amount: balance, at: new Date() };
  const floor = Number(process.env.SMS_LOW_BALANCE_USD ?? 2);
  // Once per process: an empty account otherwise announces itself only as every
  // SMS failing, by which point the pilot has already lost messages.
  if (balance < floor && !warnedLowBalance) {
    warnedLowBalance = true;
    console.warn(`[sms] gateway balance is ${balance}, below SMS_LOW_BALANCE_USD=${floor}`);
  }
};

const numberOrNull = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const driverName = (): string => process.env.SMS_DRIVER || 'log';

/** Thrown before any network call when a number cannot be an SMS recipient. */
export class InvalidNumberError extends Error {
  constructor(phone: string | null | undefined) {
    super(`'${phone ?? ''}' is not a Rwandan mobile number`);
    this.name = 'InvalidNumberError';
  }
}

// MTN (078, 079) and Airtel (072, 073). Pindo answers 409 for anything it
// cannot route, which is a billed round trip to learn what a regex knows.
const RWANDAN_MOBILE = /^\+2507[2389]\d{7}$/;

/**
 * Returns the number as +2507XXXXXXXX, or null when it is not a Rwandan mobile.
 *
 * Accepts it the ways people write it: 0788 123 456, 250788123456,
 * +250 788-123-456. Landlines (025...) and foreign numbers come back null.
 */
const toRwandanMsisdn = (phone: string | null | undefined): string | null => {
  const digits = String(phone ?? '').replace(/[\s\-().]/g, '');
  let msisdn: string;
  if (digits.startsWith('+')) msisdn = digits;
  else if (digits.startsWith('250')) msisdn = `+${digits}`;
  // 07XXXXXXXX, as almost everyone writes it locally.
  else if (digits.startsWith('0')) msisdn = `+250${digits.slice(1)}`;
  else msisdn = `+${digits}`;
  return RWANDAN_MOBILE.test(msisdn) ? msisdn : null;
};

const drivers: Record<string, SmsDriver> = {
  /** Records what would have been sent, so the flow is exercised end to end. */
  log: async ({ to, text, segments }) => {
    console.log(`[sms:log] -> ${to} (${segments} segment${segments === 1 ? '' : 's'}): ${text}`);
    return { provider: 'log', providerMessageId: null, cost: null, balance: null };
  },

  pindo: async ({ to, text }) => {
    const token = process.env.PINDO_API_TOKEN;
    if (!token) {
      throw new Error('PINDO_API_TOKEN is not set');
    }

    const response = await fetch(PINDO_ENDPOINT, {
      method: 'POST',
      // Without a bound, a stalled gateway holds the delivery open for as long
      // as the socket allows; the row would sit unwritten the whole time.
      signal: AbortSignal.timeout(Number(process.env.SMS_TIMEOUT_MS) || 10_000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        text,
        sender: process.env.SMS_SENDER_ID || 'Isoko',
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      // The two failures with a known cause get a message that says what to do;
      // anything else keeps Pindo's own words.
      if (response.status === 401) {
        throw new Error('Pindo rejected the API token (401). Check PINDO_API_TOKEN.');
      }
      if (response.status === 409) {
        throw new Error('Pindo cannot route this number or network (409).');
      }
      throw new Error(`Pindo rejected the message (${response.status}): ${body.slice(0, 200)}`);
    }

    let parsed: { sms_id?: string; id?: string; item_price?: unknown; remaining_balance?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
    return {
      provider: 'pindo',
      providerMessageId: parsed.sms_id ?? parsed.id ?? null,
      cost: numberOrNull(parsed.item_price),
      balance: numberOrNull(parsed.remaining_balance),
    };
  },
};

/**
 * Sends one message.
 *
 * Throws on failure rather than swallowing it, so the caller can record why a
 * delivery did not happen. A pilot needs to know a number was wrong or a
 * balance was empty, not merely that nothing arrived.
 *
 * Text is made GSM-7 here rather than by each caller, so none can forget it:
 * one curly apostrophe would otherwise bill a short message as three.
 */
export const send = async ({
  to,
  text,
}: {
  to: string | null | undefined;
  text: string;
}): Promise<SmsResult> => {
  const name = driverName();
  const driver = drivers[name];
  if (!driver) {
    throw new Error(`Unknown SMS_DRIVER '${name}'. Available: ${Object.keys(drivers).join(', ')}`);
  }
  const msisdn = toRwandanMsisdn(to);
  if (!msisdn) {
    throw new InvalidNumberError(to);
  }
  const safe = toGsm7(text);
  const segments = segmentCount(safe);
  const result = await driver({ to: msisdn, text: safe, segments });
  noteBalance(result.balance);
  return { ...result, segments };
};

export { driverName, toRwandanMsisdn };
