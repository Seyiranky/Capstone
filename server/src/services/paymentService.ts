import crypto from 'crypto';
import { Gig, Match, Payout, SafetyNetEntry, Transaction, User, sequelize } from '../models';
import { escrowStateOnFunding, escrowTimestampField, generateReceiptNumber } from './escrowRules';
import * as payoutService from './payoutService';
import simulatedAdapter from './payments/simulatedAdapter';
import mtnMomoAdapter, { disbursementConfigured } from './payments/mtnMomoAdapter';
import { priceOf } from './completionService';
import { MAX_CONTRIBUTION } from './safetyNetService';
import { toRwandanMsisdn } from '../lib/channels/sms';
import type { PaymentAdapter, PaymentCallback } from './payments/adapter';
import type { TransactionStatus } from '../types/domain';
import { HttpError } from '../lib/httpError';

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
  [mtnMomoAdapter.name]: mtnMomoAdapter,
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

    // Collected money enters escrow in whatever state the job calls for, in the
    // same database transaction as the settlement, so no reader ever sees a
    // confirmed payment that is neither held nor released.
    const escrow: Partial<
      Pick<Transaction, 'escrowStatus' | 'heldAt' | 'releasedAt' | 'refundedAt' | 'receiptNumber'>
    > = {};
    if (target === 'confirmed') {
      const match = await Match.findByPk(transaction.matchId, { transaction: t });
      const state = escrowStateOnFunding(match?.status ?? 'accepted');
      const field = escrowTimestampField(state);
      escrow.escrowStatus = state;
      if (field) escrow[field] = new Date();
      if (state === 'released') escrow.receiptNumber = generateReceiptNumber();
    }

    await transaction.update(
      {
        status: target,
        providerStatus: status,
        failureReason: target === 'failed' ? (failureReason ?? 'provider reported failure') : null,
        callbackReceivedAt: new Date(),
        providerRawResponse: raw ?? transaction.providerRawResponse,
        ...escrow,
      },
      { transaction: t },
    );
    // Money collected after the job was done goes straight out, so it is split
    // into payouts here exactly as a release would.
    if (escrow.escrowStatus === 'released') await payoutService.createFor(transaction, t);

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

// ── Mobile Money payment of a finished job ──────────────────────────────────

/**
 * Asks the client to pay for a finished job with Mobile Money.
 *
 * The amount is the price due (agreed, or the share a dispute decided), plus
 * any safety-net share the client adds now and the Job Cover premium if cover
 * was added during the job. A prompt goes to `payerMsisdn`; the payment settles
 * when they approve it (refreshStatus, or the provider's callback).
 *
 * One payment per job: a pending request is returned as it is, a failed one
 * may be asked for again, a confirmed one is final.
 */
export const requestForMatch = async (
  matchId: string,
  clientId: string,
  { payerMsisdn: rawMsisdn, safetyNet = 0 }: { payerMsisdn?: unknown; safetyNet?: unknown },
): Promise<Transaction> => {
  const match = (await Match.findByPk(matchId, { include: [{ model: Gig, as: 'gig' }] })) as
    | (Match & { gig?: Gig | null })
    | null;
  if (!match || !match.gig) throw new HttpError('Job not found', 404);
  if (match.gig.clientId !== clientId) throw new HttpError('Only the client pays for this job', 403);
  if (match.status !== 'completed') throw new HttpError('Mark the job as done before paying', 409);

  const payerMsisdn = toRwandanMsisdn(String(rawMsisdn ?? ''));
  if (!payerMsisdn) throw new HttpError('Enter your MTN MoMo number, for example 078 123 4567', 400);

  const price = priceOf(match, match.gig);
  const contribution = Math.round(Number(safetyNet) || 0);
  if (contribution < 0 || contribution > price * MAX_CONTRIBUTION) {
    throw new HttpError('A safety-net contribution can be at most 20% of the price', 400);
  }
  const premium = Number(match.coverPremium ?? 0);
  const total = price + contribution + premium;

  const existing = await Transaction.findOne({ where: { matchId } });
  if (existing?.status === 'confirmed') throw new HttpError('This job has already been paid', 409);
  if (existing?.status === 'initiated') return existing;

  const adapter = activeAdapter();
  const reference = `ISK-${crypto.randomUUID()}`;
  const result = await adapter.requestPayment({
    amount: total,
    currency: 'RWF',
    payerMsisdn,
    reference,
    note: `Isoko: ${match.gig.title}`.slice(0, 160),
  });
  const fields = {
    amount: price,
    currency: 'RWF',
    status: 'initiated' as const,
    provider: adapter.name,
    // The simulated provider has always used its own reference as ours; a
    // real provider keeps ours, which is what its callback quotes back.
    reference: adapter.name === simulatedAdapter.name ? result.providerReference : reference,
    providerReference: result.providerReference,
    providerStatus: result.providerStatus,
    providerRawResponse: result.raw ?? null,
    payerMsisdn,
    failureReason: null,
    safetyNetContribution: contribution || null,
    coverPremium: premium || null,
    coverPolicyNumber: match.coverPolicyNumber ?? null,
  };
  // A failed attempt is replaced by the new request rather than kept beside it.
  return existing ? existing.update(fields) : Transaction.create({ matchId, ...fields });
};

/**
 * Asks the provider where a pending payment stands and applies the answer.
 * Used by the client's screen while they approve on their phone, and to
 * verify a callback instead of trusting what it says.
 */
export const refreshStatus = async (transaction: Transaction): Promise<Transaction> => {
  if (transaction.status !== 'initiated' || !transaction.providerReference) return transaction;
  const adapter = ADAPTERS[transaction.provider];
  if (!adapter?.checkStatus) return transaction;
  const { status, failureReason, raw } = await adapter.checkStatus(transaction.providerReference);
  if (adapter.normaliseStatus(status) === 'initiated') return transaction;
  const result = await applyCallback({ provider: adapter.name, providerReference: transaction.providerReference, status, failureReason, raw });
  if (result.ok && result.transaction && result.transaction.status === 'confirmed' && !result.duplicate) {
    await sendPayouts(result.transaction);
  }
  return result.transaction ?? transaction;
};

/**
 * Sends each person's payout to their confirmed MoMo number, where the
 * provider can (MTN Disbursements configured). Best effort and recorded on the
 * payout: a transfer that fails is shown to admins to resend, and never undoes
 * the client's payment.
 */
export const sendPayouts = async (transaction: Transaction): Promise<void> => {
  const adapter = ADAPTERS[transaction.provider];
  if (!adapter?.transfer || (adapter.name === mtnMomoAdapter.name && !disbursementConfigured())) return;
  const payouts = await Payout.findAll({ where: { transactionId: transaction.id, transferStatus: ['not_sent', 'failed'] } });
  for (const payout of payouts) {
    const user = await User.findByPk(payout.userId);
    if (!user?.phone || !user.phoneVerifiedAt) {
      await payout.update({ transferStatus: 'no_number', transferError: 'No confirmed MoMo number' });
      continue;
    }
    // What the worker chose to save toward Ejo Heza stays in their savings.
    const saved = Number(
      (await SafetyNetEntry.sum('amount', { where: { payoutId: payout.id, kind: 'ejoHeza' } })) ?? 0,
    );
    try {
      const sent = await adapter.transfer({
        amount: Number(payout.amount) - saved,
        currency: payout.currency,
        payeeMsisdn: user.phone,
        reference: payout.receiptNumber,
        note: 'Isoko payout',
      });
      await payout.update({ transferStatus: 'sent', transferReference: sent.providerReference, transferError: null });
    } catch (err) {
      await payout.update({ transferStatus: 'failed', transferError: (err as Error).message.slice(0, 500) });
    }
  }
};

/** Checks every payment still waiting on the provider (the sweep in server.ts). */
export const refreshPending = async (): Promise<number> => {
  const pending = await Transaction.findAll({ where: { status: 'initiated' } });
  let settled = 0;
  for (const tx of pending) {
    try {
      if ((await refreshStatus(tx)).status !== 'initiated') settled += 1;
    } catch (err) {
      console.error(`Could not check payment ${tx.id}`, (err as Error).message);
    }
  }
  return settled;
};
