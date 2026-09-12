const crypto = require('crypto');
const { Transaction } = require('../models');

const generateReference = () => `MOMO-SIM-${crypto.randomUUID()}`;

exports.initiate = async (match, amount) => {
  return Transaction.create({
    matchId: match.id,
    amount,
    status: 'initiated',
    provider: 'simulated-momo',
    reference: generateReference(),
  });
};

exports.confirm = async (transactionId) => {
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) {
    throw Object.assign(new Error('Transaction not found'), { status: 404 });
  }
  if (transaction.status !== 'initiated') {
    throw Object.assign(new Error(`Cannot confirm a transaction with status '${transaction.status}'`), {
      status: 409,
    });
  }
  await transaction.update({ status: 'confirmed' });
  return transaction;
};

exports.fail = async (transactionId) => {
  const transaction = await Transaction.findByPk(transactionId);
  if (!transaction) {
    throw Object.assign(new Error('Transaction not found'), { status: 404 });
  }
  await transaction.update({ status: 'failed' });
  return transaction;
};
