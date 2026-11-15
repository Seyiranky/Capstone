/**
 * Imported first by rq4SandboxCheck: pay through MTN's sandbox and send no
 * email or SMS, before any service reads its configuration.
 */
import 'dotenv/config';

process.env.PAYMENT_PROVIDER = 'mtn-momo';
process.env.EMAIL_DRIVER = 'log';
process.env.SMS_DRIVER = 'log';
