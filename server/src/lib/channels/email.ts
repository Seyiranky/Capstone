import nodemailer from 'nodemailer';

/**
 * Email delivery, behind a driver so the pilot can run without a mail account.
 *
 * The default driver logs instead of sending. That is a deliberate posture, not
 * a missing integration: a sending identity needs a provider account and, for a
 * real domain, DNS records, and neither CI nor a demo should depend on one. The
 * whole feature -- preferences, verification, delivery records -- works end to
 * end on the `log` driver, and switching to real mail is a matter of env vars.
 *
 * `smtp` rather than one provider's REST API because every candidate provider
 * speaks SMTP, so changing provider stays a configuration change. Isoko sends
 * through Brevo, which needs no domain of its own; if that account ever lapses,
 * SMTP2GO or anything else is four variables away.
 */

const DEFAULT_FROM = 'Isoko <notifications@example.invalid>';

export interface EmailResult {
  provider: string;
  providerMessageId: string | null;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

type EmailDriver = (message: EmailMessage) => Promise<EmailResult>;

// Read per call, like the SMS channel's driver selection: tests set these by
// mutating process.env, and a module-scope read would freeze the first value.
const driverName = (): string => process.env.EMAIL_DRIVER || 'log';
const fromAddress = (): string => process.env.EMAIL_FROM || DEFAULT_FROM;
const appUrl = (): string => process.env.APP_URL || 'http://localhost:5173';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Renders the one layout every notification email uses.
 *
 * Both parts are built from the same title and body the in-app notification
 * carries, so the three channels cannot drift into saying different things.
 * Inline styles and no tables: this has to survive Gmail's CSS stripping.
 */
export const render = (title: string, body: string): Omit<EmailMessage, 'to'> => {
  const link = `${appUrl()}/notifications`;
  const text = [
    title,
    '',
    body,
    '',
    `See it in the app: ${link}`,
    '',
    'You can change how you hear from us in Settings > Notifications.',
  ].join('\n');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f;max-width:520px">
  <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>
  <p style="margin:0 0 16px">${escapeHtml(body)}</p>
  <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="color:#1668dc">See it in the app</a></p>
  <p style="margin:0;font-size:12px;color:#8c8c8c">You can change how you hear from us in Settings &gt; Notifications.</p>
</div>`;

  return { subject: title, text, html };
};

const drivers: Record<string, EmailDriver> = {
  log: async ({ to, subject, text }) => {
    console.log(`[email:log] -> ${to}: ${subject}\n${text}`);
    return { provider: 'log', providerMessageId: null };
  },

  smtp: async ({ to, subject, text, html }) => {
    const host = process.env.SMTP_HOST;
    if (!host) {
      throw new Error('SMTP_HOST is not set');
    }

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT) || 587;
    const transport = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS. Providers differ, so
      // this follows the port rather than needing a fifth variable.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    const info = await transport.sendMail({ from: fromAddress(), to, subject, text, html });
    return { provider: `smtp:${host}`, providerMessageId: info.messageId ?? null };
  },
};

/**
 * Sends one message, throwing rather than swallowing.
 *
 * The caller records every outcome against the notification, so a failure has
 * to arrive as an error carrying a reason -- "nothing happened" would be
 * indistinguishable from success in the delivery log.
 */
export const send = async (message: EmailMessage): Promise<EmailResult> => {
  const name = driverName();
  const driver = drivers[name];
  if (!driver) {
    throw new Error(
      `Unknown EMAIL_DRIVER '${name}'. Available: ${Object.keys(drivers).join(', ')}`,
    );
  }
  if (!message.to) {
    throw new Error('no recipient address');
  }
  return driver(message);
};

export { driverName, fromAddress, appUrl };
