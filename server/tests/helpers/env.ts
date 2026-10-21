/**
 * Pins the delivery and payment drivers before anything loads server/.env.
 *
 * dotenv never overwrites a variable that is already set, so this wins over a
 * developer's .env. Without it, a machine configured with SMS_DRIVER=pindo to
 * try the gateway would send real, billed messages every time the suite ran,
 * and one set to PAYMENT_PROVIDER=mtn-momo would send every test payment to
 * the MTN sandbox. Tests that exercise the MTN adapter set it themselves, with
 * fetch mocked.
 */
process.env.SMS_DRIVER = 'log';
process.env.EMAIL_DRIVER = 'log';
process.env.PAYMENT_PROVIDER = 'simulated-momo';
// Uploads stay on disk; the Supabase driver's tests fake its API themselves.
process.env.STORAGE_DRIVER = 'local';
// Blank, not deleted: dotenv would fill a deleted one from server/.env.
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'MOMO_COLLECTION_KEY', 'MOMO_COLLECTION_USER', 'MOMO_COLLECTION_API_KEY', 'MOMO_DISBURSEMENT_KEY', 'MOMO_DISBURSEMENT_USER', 'MOMO_DISBURSEMENT_API_KEY', 'MOMO_CALLBACK_URL']) {
  process.env[name] = '';
}
