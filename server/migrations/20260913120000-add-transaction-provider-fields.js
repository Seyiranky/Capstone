'use strict';

// NFR-8 asks that a payment be independently checkable against the provider's
// own records. That needs the provider's reference kept verbatim, not a
// locally generated one, plus enough of the raw response to reconstruct what
// was actually agreed if a worker disputes it.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Transactions', 'providerReference', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'providerStatus', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'providerRawResponse', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'callbackReceivedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'failureReason', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'payerMsisdn', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'currency', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'RWF',
    });
    // Nullable now so introducing a platform fee or escrow later needs no
    // second migration on a table that will hold live payment records.
    await queryInterface.addColumn('Transactions', 'platformFeeAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    // Two providers may legitimately issue the same reference, so uniqueness is
    // per provider. This is also the constraint that makes a duplicate callback
    // impossible to double-apply at the database level.
    await queryInterface.addConstraint('Transactions', {
      fields: ['provider', 'providerReference'],
      type: 'unique',
      name: 'Transactions_provider_providerReference_unique',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeConstraint(
      'Transactions',
      'Transactions_provider_providerReference_unique',
    );
    for (const column of [
      'platformFeeAmount',
      'currency',
      'payerMsisdn',
      'failureReason',
      'callbackReceivedAt',
      'providerRawResponse',
      'providerStatus',
      'providerReference',
    ]) {
      await queryInterface.removeColumn('Transactions', column);
    }
  },
};
