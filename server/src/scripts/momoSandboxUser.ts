/**
 * Creates an MTN MoMo sandbox API user and key from a subscription key, and
 * writes all three into server/.env.
 *
 *   npm run momo:sandbox-user                    # Collections
 *   npm run momo:sandbox-user -- disbursement    # Disbursements (optional)
 *
 * The subscription key is the Primary key on your Profile page at
 * momodeveloper.mtn.com, after subscribing to the product (not the key shown
 * on the product page). It is asked for at a hidden prompt, or read from
 * MOMO_SUBSCRIPTION_KEY, so it never sits in shell history or on screen; the
 * values are written to server/.env and none of them is printed.
 *
 * Production users and keys are issued by MTN instead, through the partner
 * portal; this is for the sandbox only.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const BASE = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const ENV_FILE = path.join(__dirname, '..', '..', '.env');

/** Asks for a value without echoing what is typed. */
const askHidden = (question: string): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    output._writeToOutput = (s: string) => {
      // Show the question once; swallow the echo of each typed character.
      if (!prompted) {
        output.output.write(s);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });

/** Sets each variable in server/.env, replacing a line that is already there. */
const writeEnv = (values: Record<string, string>) => {
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
};

const main = async () => {
  const product = process.argv[2] ?? 'collection';
  if (!['collection', 'disbursement'].includes(product)) {
    console.error('Usage: npm run momo:sandbox-user -- [collection|disbursement]');
    process.exit(1);
  }
  const key =
    process.env.MOMO_SUBSCRIPTION_KEY?.trim() ||
    (await askHidden(`Paste your MoMo ${product} subscription key (Profile page, Primary key): `));
  if (!key) {
    console.error('No key given.');
    process.exit(1);
  }

  const userId = crypto.randomUUID();
  const created = await fetch(`${BASE}/v1_0/apiuser`, {
    method: 'POST',
    headers: { 'X-Reference-Id': userId, 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerCallbackHost: process.env.MOMO_CALLBACK_HOST || 'localhost' }),
  });
  if (created.status !== 201) {
    console.error(`Creating the API user failed (${created.status}). Check the key is the Primary key from your Profile page.`);
    process.exit(1);
  }
  const keyRes = await fetch(`${BASE}/v1_0/apiuser/${userId}/apikey`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (keyRes.status !== 201) {
    console.error(`Creating the API key failed (${keyRes.status}).`);
    process.exit(1);
  }
  const { apiKey } = (await keyRes.json()) as { apiKey: string };
  const prefix = product === 'collection' ? 'MOMO_COLLECTION' : 'MOMO_DISBURSEMENT';
  writeEnv({
    [`${prefix}_KEY`]: key,
    [`${prefix}_USER`]: userId,
    [`${prefix}_API_KEY`]: apiKey,
    ...(process.env.MOMO_TARGET_ENV ? {} : { MOMO_TARGET_ENV: 'sandbox' }),
  });
  console.log(`Done: ${prefix}_KEY, ${prefix}_USER and ${prefix}_API_KEY are set in server/.env (values not shown).`);
  console.log('Next: npm run momo:smoke');
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
