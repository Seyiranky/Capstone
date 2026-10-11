/**
 * SMS delivery, behind a driver so the pilot can run without a live account.
 *
 * The default driver logs instead of sending. That is not a placeholder for a
 * missing integration — a Rwandan sender ID needs a company registration
 * certificate and RURA approval taking about three weeks, so a student project
 * cannot assume live access exists on any particular date. Everything above
 * this layer is written as if it does, and swapping SMS_DRIVER is the whole
 * change when credentials arrive.
 */
const PINDO_ENDPOINT = process.env.PINDO_ENDPOINT || 'https://api.pindo.io/v1/sms/';

export interface SmsResult {
  provider: string;
  providerMessageId: string | null;
}

type SmsDriver = (message: { to: string; text: string }) => Promise<SmsResult>;

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
  log: async ({ to, text }) => {
    console.log(`[sms:log] -> ${to}: ${text}`);
    return { provider: 'log', providerMessageId: null };
  },

  pindo: async ({ to, text }) => {
    const token = process.env.PINDO_API_TOKEN;
    if (!token) {
      throw new Error('PINDO_API_TOKEN is not set');
    }

    const response = await fetch(PINDO_ENDPOINT, {
      method: 'POST',
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
      throw new Error(`Pindo rejected the message (${response.status}): ${body.slice(0, 200)}`);
    }

    let parsed: { sms_id?: string; id?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = {};
    }
    return { provider: 'pindo', providerMessageId: parsed.sms_id ?? parsed.id ?? null };
  },
};

/**
 * Sends one message.
 *
 * Throws on failure rather than swallowing it, so the caller can record why a
 * delivery did not happen. A pilot needs to know a number was wrong or a
 * balance was empty, not merely that nothing arrived.
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
  return driver({ to: msisdn, text });
};

export { driverName, toRwandanMsisdn };
