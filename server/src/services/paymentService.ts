import crypto from 'crypto';
import { Transaction, sequelize } from '../models';
import simulatedAdapter from './payments/simulatedAdapter';
import type { PaymentAdapter, PaymentCallback } from './payments/adapter';
import type { TransactionStatus } from '../types/domain';
import { HttpError } from '../lib/httpError';
import type { Match } from '../models/Match';

/**
 * Provider-agnostic payment handling.
 *
 * Controllers talk to this façade and never to a provider, so swapping the
 * simulated adapter for a real gateway is an environment variable rather than
 * a rewrite. The adapter contract is deliberately shaped like a real
 * mobile-money API — request now, confirm later by callback — so the code above
 * it is already correct for one.
 */
const ADAPTERS: Record<string, PaymentAdapter> = {
  [simulatedAdapter.name]: simulatedAdapter,
};

const activeAdapter = (): PaymentAdapter => {
  const name = process.env.PAYMENT_PROVIDER || simulatedAdapter.name;
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `Unknown PAYMENT_PROVIDER '${name}'. Available: ${Object.keys(ADAPTERS).join(', ')}`,
    );
  }
  return adapter;
};

export const initiate = async (
  match: Match,
  amount: number,
  { payerMsisdn }: { payerMsisdn?: string | null } = {},
): Promise<Transaction> => {
  const adapter = activeAdapter();
  const reference = `ISK-${crypto.randomUUID()}`;

  const result = await adapter.requestPayment({
    amount,
    currency: 'RWF',
    payerMsisdn,
    reference,
  });

  return Transaction.create({
    matchId: match.id,
    amount,
    currency: 'RWF',
    status: 'initiated',
    provider: adapter.name,
    // The platform's own handle on the payment. Kept distinct from the
    // provider's reference so a provider change never rewrites our history.
    reference: result.providerReference,
    providerReference: result.providerReference,
    providerStatus: result.providerStatus,
    providerRawResponse: result.raw ?? null,
    payerMsisdn: payerMsisdn ?? null,
  });
};

const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  initiated: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
};

/**
 * Whether a settled-state change is permitted.
 *
 * The table above is exhaustive over TransactionStatus, so adding a state
 * fails to compile until its transitions are declared. The lookup still
 * tolerates a row holding something outside the union, which is what the
 * original `?.` guarded against.
 */
const canTransition = (from: string, to: TransactionStatus): boolean =>
  ALLOWED_TRANSITIONS[from as TransactionStatus]?.includes(to) ?? false;

/** What applyCallback reports back to the webhook controller. */
export type CallbackResult =
  | { ok: false; reason: 'unknownProvider' | 'unknownTransaction'; transaction?: undefined }
  | { ok: true; duplicate: true; conflicting?: boolean; transaction: Transaction }
  | { ok: true; duplicate: false; transaction: Transaction };

/**
 * Applies a provider callback.
 *
 * Idempotent by construction (NFR-4): a transaction already in a terminal
 * state is left exactly as it was and reported as a duplicate. Providers retry
 * webhooks routinely, and a second 'SUCCESSFUL' must not produce a second
 * payment or a second notification.
 *
 * The row is locked while it is read and written, so two callbacks arriving
 * together cannot both observe 'initiated' and both apply.
 */
export const applyCallback = async ({
  provider,
  providerReference,
  status,
  failureReason,
  raw,
}: PaymentCallback): Promise<CallbackResult> => {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    return { ok: false, reason: 'unknownProvider' };
  }

  return sequelize.transaction(async (t): Promise<CallbackResult> => {
    const transaction = await Transaction.findOne({
      where: { provider, providerReference },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!transaction) {
      return { ok: false, reason: 'unknownTransaction' };
    }

    const target = adapter.normaliseStatus(status);

    if (target === transaction.status) {
      return { ok: true, duplicate: true, transaction };
    }
    if (!canTransition(transaction.status, target)) {
      // Already settled the other way. Recorded, never silently overwritten.
      return { ok: true, duplicate: true, conflicting: true, transaction };
    }

    await transaction.update(
      {
        status: target,
        providerStatus: status,
        failureReason: target === 'failed' ? (failureReason ?? 'provider reported failure') : null,
        callbackReceivedAt: new Date(),
        providerRawResponse: raw ?? transaction.providerRawResponse,
      },
      { transaction: t },
    );

    return { ok: true, duplicate: false, transaction };
  });
};

/** Loads a transaction that is still open, or explains why it is not. */
const openTransaction = async (transactionId: string, verb: string): Promise<Transaction> => {
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) {
    throw new HttpError('Transaction not found', 404);
  }
  if (transaction.status !== 'initiated') {
    throw new HttpError(
      `Cannot ${verb} a transaction with status '${transaction.status}'`,
      409,
    );
  }
  return transaction;
};

/**
 * Confirms a payment from inside the platform.
 *
 * Routed through the same callback path a provider would use, so the
 * simulated flow exercises the real code rather than a shortcut that only
 * exists in simulation and is therefore never tested.
 */
export const confirm = async (transactionId: string): Promise<Transaction> => {
  const transaction = await openTransaction(transactionId, 'confirm');

  const adapter = ADAPTERS[transaction.provider] ?? simulatedAdapter;
  const callback = adapter.buildCallback({
    providerReference: transaction.providerReference ?? transaction.reference,
    status: 'SUCCESSFUL',
  });
  const result = await applyCallback(callback);
  return result.transaction ?? transaction;
};

export const fail = async (transactionId: string, reason?: string): Promise<Transaction> => {
  const transaction = await openTransaction(transactionId, 'fail');

  const adapter = ADAPTERS[transaction.provider] ?? simulatedAdapter;
  const callback = adapter.buildCallback({
    providerReference: transaction.providerReference ?? transaction.reference,
    status: 'FAILED',
    failureReason: reason,
  });
  const result = await applyCallback(callback);
  return result.transaction ?? transaction;
};

export { activeAdapter, ADAPTERS };
