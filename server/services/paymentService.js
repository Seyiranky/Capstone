const crypto = require('crypto');
const { Transaction, sequelize } = require('../models');
const simulatedAdapter = require('./payments/simulatedAdapter');

/**
 * Provider-agnostic payment handling.
 *
 * Controllers talk to this façade and never to a provider, so swapping the
 * simulated adapter for a real gateway is an environment variable rather than
 * a rewrite. The adapter contract is deliberately shaped like a real
 * mobile-money API — request now, confirm later by callback — so the code above
 * it is already correct for one.
 */
const ADAPTERS = {
  [simulatedAdapter.name]: simulatedAdapter,
};

const activeAdapter = () => {
  const name = process.env.PAYMENT_PROVIDER || simulatedAdapter.name;
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `Unknown PAYMENT_PROVIDER '${name}'. Available: ${Object.keys(ADAPTERS).join(', ')}`,
    );
  }
  return adapter;
};

exports.initiate = async (match, amount, { payerMsisdn } = {}) => {
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

const ALLOWED_TRANSITIONS = {
  initiated: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
};

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
exports.applyCallback = async ({ provider, providerReference, status, failureReason, raw }) => {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    return { ok: false, reason: 'unknownProvider' };
  }

  return sequelize.transaction(async (t) => {
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
    if (!ALLOWED_TRANSITIONS[transaction.status]?.includes(target)) {
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

/**
 * Confirms a payment from inside the platform.
 *
 * Routed through the same callback path a provider would use, so the
 * simulated flow exercises the real code rather than a shortcut that only
 * exists in simulation and is therefore never tested.
 */
exports.confirm = async (transactionId) => {
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) {
    throw Object.assign(new Error('Transaction not found'), { status: 404 });
  }
  if (transaction.status !== 'initiated') {
    throw Object.assign(
      new Error(`Cannot confirm a transaction with status '${transaction.status}'`),
      { status: 409 },
    );
  }

  const adapter = ADAPTERS[transaction.provider] ?? simulatedAdapter;
  const callback = adapter.buildCallback({
    providerReference: transaction.providerReference ?? transaction.reference,
    status: 'SUCCESSFUL',
  });
  const result = await exports.applyCallback(callback);
  return result.transaction ?? transaction;
};

exports.fail = async (transactionId, reason) => {
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) {
    throw Object.assign(new Error('Transaction not found'), { status: 404 });
  }
  if (transaction.status !== 'initiated') {
    throw Object.assign(
      new Error(`Cannot fail a transaction with status '${transaction.status}'`),
      { status: 409 },
    );
  }

  const adapter = ADAPTERS[transaction.provider] ?? simulatedAdapter;
  const callback = adapter.buildCallback({
    providerReference: transaction.providerReference ?? transaction.reference,
    status: 'FAILED',
    failureReason: reason,
  });
  const result = await exports.applyCallback(callback);
  return result.transaction ?? transaction;
};

exports.activeAdapter = activeAdapter;
exports.ADAPTERS = ADAPTERS;
