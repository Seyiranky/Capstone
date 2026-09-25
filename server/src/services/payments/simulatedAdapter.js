const crypto = require('crypto');

/**
 * The simulated mobile-money provider.
 *
 * Kept byte-for-byte compatible with what the platform has always produced —
 * the 'simulated-momo' provider name and the MOMO-SIM- reference prefix — so
 * existing records and the tests that assert them stay valid.
 *
 * It is also the reference implementation of the adapter contract: a real
 * provider implements these four methods and nothing above this layer changes.
 */
const PROVIDER = 'simulated-momo';

exports.name = PROVIDER;

/**
 * Asks the provider to collect money.
 *
 * A real provider returns immediately with a pending reference and confirms
 * later by webhook, so the simulated one does the same rather than succeeding
 * synchronously. Code written against this shape works unchanged against a
 * real gateway.
 */
exports.requestPayment = async ({ amount, currency = 'RWF', payerMsisdn, reference }) => {
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
exports.buildCallback = ({ providerReference, status = 'SUCCESSFUL', failureReason = null }) => ({
  provider: PROVIDER,
  providerReference,
  status,
  failureReason,
  raw: { simulated: true, receivedAt: new Date().toISOString() },
});

/** Maps a provider's vocabulary onto the platform's three states. */
exports.normaliseStatus = (providerStatus) => {
  const value = String(providerStatus ?? '').toUpperCase();
  if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED'].includes(value)) return 'confirmed';
  if (['FAILED', 'REJECTED', 'CANCELLED', 'TIMEOUT'].includes(value)) return 'failed';
  return 'initiated';
};

exports.PROVIDER = PROVIDER;
