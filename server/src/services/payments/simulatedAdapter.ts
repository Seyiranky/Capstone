import crypto from 'crypto';
import type {
  BuildCallbackInput,
  PaymentAdapter,
  PaymentCallback,
  PaymentRequest,
  PaymentRequestResult,
} from './adapter';
import type { TransactionStatus } from '../../types/domain';

/**
 * The simulated mobile-money provider.
 *
 * Kept byte-for-byte compatible with what the platform has always produced —
 * the 'simulated-momo' provider name and the MOMO-SIM- reference prefix — so
 * existing records and the tests that assert them stay valid.
 *
 * It is also the reference implementation of the adapter contract: a real
 * provider implements these four members and nothing above this layer changes.
 */
const PROVIDER = 'simulated-momo';

export const name = PROVIDER;

/**
 * Asks the provider to collect money.
 *
 * A real provider returns immediately with a pending reference and confirms
 * later by webhook, so the simulated one does the same rather than succeeding
 * synchronously. Code written against this shape works unchanged against a
 * real gateway.
 */
export const requestPayment = async ({
  amount,
  currency = 'RWF',
  payerMsisdn,
  reference,
}: PaymentRequest): Promise<PaymentRequestResult> => {
  const providerReference = `MOMO-SIM-${crypto.randomUUID()}`;
  return {
    providerReference,
    providerStatus: 'PENDING',
    raw: {
      simulated: true,
      requestedAt: new Date().toISOString(),
      amount,
      currency,
      payerMsisdn: payerMsisdn ?? null,
      localReference: reference,
    },
  };
};

/**
 * What the provider would send when the payer approves.
 *
 * Exposed so the confirm endpoint can drive the same webhook path a real
 * provider would, rather than having a second code path that only exists in
 * simulation and is therefore never exercised.
 */
export const buildCallback = ({
  providerReference,
  status = 'SUCCESSFUL',
  failureReason = null,
}: BuildCallbackInput): PaymentCallback => ({
  provider: PROVIDER,
  providerReference,
  status,
  failureReason,
  raw: { simulated: true, receivedAt: new Date().toISOString() },
});

/** Maps a provider's vocabulary onto the platform's three states. */
export const normaliseStatus = (
  providerStatus: string | null | undefined,
): TransactionStatus => {
  const value = String(providerStatus ?? '').toUpperCase();
  if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED'].includes(value)) return 'confirmed';
  if (['FAILED', 'REJECTED', 'CANCELLED', 'TIMEOUT'].includes(value)) return 'failed';
  return 'initiated';
};

export { PROVIDER };

/** When each simulated request was made, so a status check can play the payer approving it. */
const requestedAt = new Map<string, number>();
const APPROVE_AFTER_MS = 4000;

/**
 * Where a simulated payment stands: approved a few seconds after it was
 * requested, as a person would on their phone. A reference this process never
 * issued (the server restarted since) counts as approved.
 */
export const checkStatus = async (providerReference: string) => {
  const at = requestedAt.get(providerReference);
  const approved = at === undefined || Date.now() - at >= APPROVE_AFTER_MS;
  return { status: approved ? 'SUCCESSFUL' : 'PENDING', failureReason: null, raw: { simulated: true } };
};

/** The module, viewed through the contract — this is what the façade registers. */
const simulatedAdapter: PaymentAdapter = {
  name,
  requestPayment: async (input) => {
    const result = await requestPayment(input);
    requestedAt.set(result.providerReference, Date.now());
    return result;
  },
  buildCallback,
  normaliseStatus,
  checkStatus,
};

export default simulatedAdapter;
