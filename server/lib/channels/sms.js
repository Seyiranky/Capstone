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

const driverName = () => process.env.SMS_DRIVER || 'log';

/** Rwandan numbers reach the gateway in international form. */
const normaliseMsisdn = (phone) => {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('250')) return `+${digits}`;
  // 07XXXXXXXX, as almost everyone writes it locally.
  if (digits.startsWith('0')) return `+250${digits.slice(1)}`;
  return `+${digits}`;
};

const drivers = {
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

    let parsed;
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
exports.send = async ({ to, text }) => {
  const name = driverName();
  const driver = drivers[name];
  if (!driver) {
    throw new Error(`Unknown SMS_DRIVER '${name}'. Available: ${Object.keys(drivers).join(', ')}`);
  }
  return driver({ to: normaliseMsisdn(to), text });
};

exports.driverName = driverName;
exports.normaliseMsisdn = normaliseMsisdn;
