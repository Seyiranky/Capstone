'use strict';

/**
 * A safety net for informal workers, on every paid job.
 *
 * Clients may add a small contribution when they pay into escrow (Alia's model
 * for house cleaners, where many clients each add a little to one pot the
 * worker owns). Workers may also set aside a share of every payout toward Ejo
 * Heza, Rwanda's long-term savings scheme for informal workers. Every movement
 * is a ledger entry, so the balance is always the sum of its history.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Transactions', 'safetyNetContribution', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'savingsPercent', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.createTable('SafetyNetEntries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      payoutId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Payouts', key: 'id' },
        onDelete: 'SET NULL',
      },
      kind: { type: Sequelize.STRING, allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      note: { type: Sequelize.STRING(280), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('SafetyNetEntries', ['userId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SafetyNetEntries');
    await queryInterface.removeColumn('Users', 'savingsPercent');
    await queryInterface.removeColumn('Transactions', 'safetyNetContribution');
  },
};
