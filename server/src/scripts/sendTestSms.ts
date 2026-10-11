/**
 * Sends one SMS through the configured driver, outside any notification.
 *
 * For checking a gateway account before trusting it with real notices: it goes
 * through exactly the code `notify()` uses (number normalisation, driver
 * selection, error handling), so a success here means the app can send too.
 *
 *   npm run sms:test -- 0788123456
 *   npm run sms:test -- 0788123456 "Custom text"
 *
 * Reads SMS_DRIVER, PINDO_API_TOKEN and SMS_SENDER_ID from server/.env. On the
 * default `log` driver nothing leaves the machine.
 */
import 'dotenv/config';
import * as sms from '../lib/channels/sms';

const run = async () => {
  const [to, ...words] = process.argv.slice(2);
  if (!to) {
    console.error('Usage: npm run sms:test -- <phone> [text]');
    process.exit(1);
  }
  const text = words.join(' ') || `Isoko test ${new Date().toISOString().slice(11, 19)}`;

  console.log(`driver=${sms.driverName()} sender=${process.env.SMS_SENDER_ID || 'Isoko'}`);
  console.log(`to=${sms.toRwandanMsisdn(to) ?? `(invalid) ${to}`} text="${text}"`);

  try {
    const result = await sms.send({ to, text });
    console.log('sent', result);
  } catch (error) {
    console.error('failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

void run();
