/**
 * One real request-to-pay against the MTN MoMo sandbox, followed to its end.
 *
 *   npm run momo:smoke                 # a payer the sandbox approves
 *   npm run momo:smoke -- 46733123450  # a sandbox number that fails, to see the failure path
 *
 * Goes through the same adapter the app uses (token, requesttopay, status
 * polling), so a pass here means the app's MoMo payments will work with these
 * credentials. Prints the MTN reference and each status, never a key. Not run
 * in CI: it needs credentials and the network.
 */
import 'dotenv/config';
import crypto from 'crypto';
import adapter from '../services/payments/mtnMomoAdapter';

const DEFAULT_PAYER = '46733123460';

const main = async () => {
  const payer = process.argv[2] ?? DEFAULT_PAYER;
  const reference = `ISK-SMOKE-${crypto.randomUUID().slice(0, 8)}`;
  console.log(`Requesting 100 from sandbox payer ${payer} (reference ${reference})...`);
  const started = Date.now();
  const { providerReference } = await adapter.requestPayment({
    amount: 100,
    payerMsisdn: payer,
    reference,
    note: 'Isoko sandbox check',
  });
  console.log(`MTN accepted it. MTN reference: ${providerReference}`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { status, failureReason } = await adapter.checkStatus!(providerReference);
    const ours = adapter.normaliseStatus(status);
    console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s  MTN: ${status}  Isoko: ${ours}${failureReason ? `  (${failureReason})` : ''}`);
    if (ours !== 'initiated') {
      console.log(ours === 'confirmed' ? 'Sandbox payment confirmed.' : 'Sandbox payment failed, as a failing number should.');
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('Still pending after 30 s.');
  process.exitCode = 1;
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
