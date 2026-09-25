import type { TransactionStatus } from '../../types/domain';

/**
 * What a payment provider has to offer this platform.
 *
 * Written as a contract rather than inferred from the simulated provider so
 * that adding a real gateway is a matter of satisfying an interface, not of
 * guessing which of the simulated adapter's habits were load-bearing. The
 * shape is deliberately that of a real mobile-money API — request now, settle
 * later by callback — so nothing above this layer has to change when one
 * arrives.
 */
export interface PaymentAdapter {
  /** The value stored in Transaction.provider. Rows keep the name of the
   *  adapter that created them, so historical payments stay settleable after a
   *  provider change. */
  readonly name: string;

  /** Asks the provider to collect money. Answers immediately with a pending
   *  reference; success or failure arrives later as a callback. */
  requestPayment(input: PaymentRequest): Promise<PaymentRequestResult>;

  /** What the provider would send on settlement. Exposed so an internal
   *  confirmation can drive the same callback path a provider would, rather
   *  than a second route that only exists in simulation and is never
   *  exercised. */
  buildCallback(input: BuildCallbackInput): PaymentCallback;

  /** Maps the provider's vocabulary onto the platform's three states. */
  normaliseStatus(providerStatus: string | null | undefined): TransactionStatus;
}

export interface PaymentRequest {
  amount: number;
  currency?: string;
  payerMsisdn?: string | null;
  /** The platform's own reference, passed through for reconciliation. */
  reference: string;
}

export interface PaymentRequestResult {
  providerReference: string;
  providerStatus: string;
  raw?: unknown;
}

export interface BuildCallbackInput {
  providerReference: string;
  status?: string;
  failureReason?: string | null;
}

export interface PaymentCallback {
  provider: string;
  providerReference: string;
  status: string;
  failureReason: string | null;
  raw?: unknown;
}
