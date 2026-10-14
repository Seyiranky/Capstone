/**
 * Creates an MTN MoMo sandbox API user and key from a subscription key.
 *
 *   npm run momo:sandbox-user -- <subscription-key> [collection|disbursement]
 *
 * The subscription key comes from your profile on momodeveloper.mtn.com after
 * subscribing to the product (Collections, and optionally Disbursements). The
 * printed lines go into server/.env. Production users and keys are issued by
 * MTN instead, through the partner portal.
 */
import crypto from 'crypto';

const BASE = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';

const main = async () => {
  const [key, product = 'collection'] = process.argv.slice(2);
  if (!key || !['collection', 'disbursement'].includes(product)) {
    console.error('Usage: npm run momo:sandbox-user -- <subscription-key> [collection|disbursement]');
    process.exit(1);
  }
  const userId = crypto.randomUUID();
  const created = await fetch(`${BASE}/v1_0/apiuser`, {
    method: 'POST',
    headers: { 'X-Reference-Id': userId, 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerCallbackHost: process.env.MOMO_CALLBACK_HOST || 'localhost' }),
  });
  if (created.status !== 201) {
    console.error(`Creating the API user failed (${created.status}): ${await created.text()}`);
    process.exit(1);
  }
  const keyRes = await fetch(`${BASE}/v1_0/apiuser/${userId}/apikey`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (keyRes.status !== 201) {
    console.error(`Creating the API key failed (${keyRes.status}): ${await keyRes.text()}`);
    process.exit(1);
  }
  const { apiKey } = (await keyRes.json()) as { apiKey: string };
  const prefix = product === 'collection' ? 'MOMO_COLLECTION' : 'MOMO_DISBURSEMENT';
  console.log('Add these to server/.env:\n');
  console.log(`${prefix}_KEY=${key}`);
  console.log(`${prefix}_USER=${userId}`);
  console.log(`${prefix}_API_KEY=${apiKey}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
