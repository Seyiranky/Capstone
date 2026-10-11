/**
 * Pins the delivery drivers to `log` before anything loads server/.env.
 *
 * dotenv never overwrites a variable that is already set, so this wins over a
 * developer's .env. Without it, a machine configured with SMS_DRIVER=pindo to
 * try the gateway would send real, billed messages every time the suite ran.
 */
process.env.SMS_DRIVER = 'log';
process.env.EMAIL_DRIVER = 'log';
