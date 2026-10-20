import crypto from 'crypto';
import type {
  BuildCallbackInput,
  PaymentAdapter,
  PaymentCallback,
  PaymentRequest,
  PaymentRequestResult,
  TransferRequest,
} from './adapter';
import type { TransactionStatus } from '../../types/domain';

/**
 * MTN Mobile Money, through the MoMo Open API.
 *
 * Collections takes the client's payment: a "request to pay" pushes a prompt
 * to their phone, they approve it with their PIN, and the request settles a
 * few seconds to minutes later. Disbursements, when configured, sends each
 * worker's share to their own MoMo number.
 *
 * Configuration (server/.env):
 *   MOMO_BASE_URL                 https://sandbox.momodeveloper.mtn.com (default) or the production host MTN gives you
 *   MOMO_TARGET_ENV               sandbox (default) or the production environment name, e.g. mtnrwanda
 *   MOMO_CURRENCY                 EUR in the sandbox (the only currency it accepts); RWF in production
 *   MOMO_COLLECTION_KEY           Collections subscription key (Ocp-Apim-Subscription-Key)
 *   MOMO_COLLECTION_USER          API user id (`npm run momo:sandbox-user` creates one in the sandbox)
 *   MOMO_COLLECTION_API_KEY       API key for that user
 *   MOMO_DISBURSEMENT_KEY / _USER / _API_KEY   the same three for Disbursements (optional)
 *   MOMO_CALLBACK_URL             public https URL of /api/webhooks/momo (optional; status is also polled)
 *
 * Nothing secret is logged. Tokens are cached until shortly before they expire.
 */
const PROVIDER = 'mtn-momo';

type Product = 'collection' | 'disbursement';

const env = (name: string, fallback?: string) => {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`${name} is not set; see the MTN MoMo section of server/.env.example`);
  return v;
};
const baseUrl = () => env('MOMO_BASE_URL', 'https://sandbox.momodeveloper.mtn.com').replace(/\/$/, '');
const targetEnv = () => env('MOMO_TARGET_ENV', 'sandbox');
const currency = () => env('MOMO_CURRENCY', targetEnv() === 'sandbox' ? 'EUR' : 'RWF');

const credentials = (product: Product) => {
  const prefix = product === 'collection' ? 'MOMO_COLLECTION' : 'MOMO_DISBURSEMENT';
  return { key: env(`${prefix}_KEY`), user: env(`${prefix}_USER`), apiKey: env(`${prefix}_API_KEY`) };
};

export const disbursementConfigured = () =>
  Boolean(process.env.MOMO_DISBURSEMENT_KEY && process.env.MOMO_DISBURSEMENT_USER && process.env.MOMO_DISBURSEMENT_API_KEY);

const tokens: Partial<Record<Product, { value: string; expiresAt: number }>> = {};

/** An access token for one product, cached until a minute before it expires. */
const token = async (product: Product): Promise<string> => {
  const cached = tokens[product];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const { key, user, apiKey } = credentials(product);
  const res = await fetch(`${baseUrl()}/${product}/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${apiKey}`).toString('base64')}`,
      'Ocp-Apim-Subscription-Key': key,
    },
  });
  if (!res.ok) throw new Error(`MTN MoMo ${product} token request failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokens[product] = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
};

/** For tests: forget cached tokens. */
export const resetTokens = () => {
  delete tokens.collection;
  delete tokens.disbursement;
};

const headers = async (product: Product, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${await token(product)}`,
  'X-Target-Environment': targetEnv(),
  'Ocp-Apim-Subscription-Key': credentials(product).key,
  ...extra,
});

/** MoMo wants the number in international form without the plus: 2507XXXXXXXX. */
const partyId = (msisdn: string) => msisdn.replace(/[^0-9]/g, '');

export const requestPayment = async ({ amount, payerMsisdn, reference, note }: PaymentRequest): Promise<PaymentRequestResult> => {
  if (!payerMsisdn) throw new Error('A MoMo number is needed to request payment');
  const referenceId = crypto.randomUUID();
  const body = {
    amount: String(Math.round(amount)),
    currency: currency(),
    externalId: reference,
    payer: { partyIdType: 'MSISDN', partyId: partyId(payerMsisdn) },
    payerMessage: (note ?? 'Isoko payment').slice(0, 160),
    payeeNote: reference,
  };
  const res = await fetch(`${baseUrl()}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: await headers('collection', {
      'X-Reference-Id': referenceId,
      'Content-Type': 'application/json',
      ...(process.env.MOMO_CALLBACK_URL ? { 'X-Callback-Url': process.env.MOMO_CALLBACK_URL } : {}),
    }),
    body: JSON.stringify(body),
  });
  // 202 Accepted: the prompt is on its way to the payer's phone.
  if (res.status !== 202) {
    const detail = await res.text().catch(() => '');
    throw new Error(`MTN MoMo refused the payment request (${res.status}) ${detail.slice(0, 200)}`);
  }
  return { providerReference: referenceId, providerStatus: 'PENDING', raw: { requested: body } };
};

export const checkStatus = async (providerReference: string) => {
  const res = await fetch(`${baseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(providerReference)}`, {
    headers: await headers('collection'),
  });
  if (!res.ok) throw new Error(`MTN MoMo status check failed (${res.status})`);
  const body = (await res.json()) as { status?: string; reason?: string | { code?: string; message?: string } };
  const reason = typeof body.reason === 'string' ? body.reason : (body.reason?.message ?? body.reason?.code ?? null);
  return { status: String(body.status ?? 'PENDING'), failureReason: reason ?? null, raw: body };
};

export const transfer = async ({ amount, payeeMsisdn, reference, note }: TransferRequest) => {
  const referenceId = crypto.randomUUID();
  const res = await fetch(`${baseUrl()}/disbursement/v1_0/transfer`, {
    method: 'POST',
    headers: await headers('disbursement', { 'X-Reference-Id': referenceId, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      amount: String(Math.round(amount)),
      currency: currency(),
      externalId: reference,
      payee: { partyIdType: 'MSISDN', partyId: partyId(payeeMsisdn) },
      payerMessage: (note ?? 'Isoko payout').slice(0, 160),
      payeeNote: reference,
    }),
  });
  if (res.status !== 202) throw new Error(`MTN MoMo refused the transfer (${res.status})`);
  return { providerReference: referenceId, status: 'PENDING' };
};

/** A callback is only a hint: the platform re-reads the status from MTN before acting. */
export const buildCallback = ({ providerReference, status = 'SUCCESSFUL', failureReason = null }: BuildCallbackInput): PaymentCallback => ({
  provider: PROVIDER,
  providerReference,
  status,
  failureReason,
});

export const normaliseStatus = (providerStatus: string | null | undefined): TransactionStatus => {
  const value = String(providerStatus ?? '').toUpperCase();
  if (value === 'SUCCESSFUL') return 'confirmed';
  if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED'].includes(value)) return 'failed';
  return 'initiated';
};

const adapter: PaymentAdapter = {
  name: PROVIDER,
  requestPayment,
  buildCallback,
  normaliseStatus,
  checkStatus,
  transfer,
};

export const name = PROVIDER;
export default adapter;
