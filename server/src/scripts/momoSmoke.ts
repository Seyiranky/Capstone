/**
 * One real request-to-pay against the MTN MoMo sandbox, followed to its end.
 *
 *   npm run momo:smoke                 # a Rwandan payer; the sandbox approves it
 *   npm run momo:smoke -- 46733123460  # a reserved sandbox number that fails
 *   npm run momo:smoke -- 46733123453  # a reserved sandbox number that stays pending
 *
 * The sandbox approves ordinary numbers and reserves a few 46733123xxx numbers
 * to simulate outcomes (checked 20 Oct 2026: ...460 fails, ...453 stays
 * pending). Currency is EUR in the sandbox; RWF is refused there.
 *
 * Goes through the same adapter the app uses (token, requesttopay, status
 * polling), so a pass here means the app's MoMo payments will work with these
 * credentials. Prints the MTN reference and each status, never a key. Not run
 * in CI: it needs credentials and the network.
 */
import 'dotenv/config';
import crypto from 'crypto';
import adapter from '../services/payments/mtnMomoAdapter';

// The shape a client's MoMo number has in Isoko: 2507XXXXXXXX.
const DEFAULT_PAYER = '250788123456';

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
    const { status, failureReason, raw } = await adapter.checkStatus!(providerReference);
    const ours = adapter.normaliseStatus(status);
    console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s  MTN: ${status}  Isoko: ${ours}${failureReason ? `  (${failureReason})` : ''}`);
    if (ours !== 'initiated') {
      const mtnId = (raw as { financialTransactionId?: string } | undefined)?.financialTransactionId;
      console.log(
        ours === 'confirmed'
          ? `Sandbox payment confirmed. MTN transaction id: ${mtnId ?? 'none given'}`
          : `Sandbox payment failed: ${failureReason ?? status}.`,
      );
      if (ours !== 'confirmed') process.exitCode = 1;
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
