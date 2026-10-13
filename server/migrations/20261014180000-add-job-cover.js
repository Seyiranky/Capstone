'use strict';

/**
 * Job Cover: accident cover bought per on-site job.
 *
 * The client adds it when paying into escrow; it covers the worker's medical
 * costs from an accident on that job. The insurer is simulated, as the
 * payment provider is. A covered worker files a claim, which an admin decides.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Transactions', 'coverPremium', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn('Transactions', 'coverPolicyNumber', { type: Sequelize.STRING, allowNull: true, unique: true });
    await queryInterface.createTable('CoverClaims', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      transactionId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Transactions', key: 'id' }, onDelete: 'CASCADE' },
      matchId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Matches', key: 'id' }, onDelete: 'CASCADE' },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      description: { type: Sequelize.TEXT, allowNull: false },
      amountRequested: { type: Sequelize.INTEGER, allowNull: false },
      amountApproved: { type: Sequelize.INTEGER, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'submitted' },
      decisionNote: { type: Sequelize.TEXT, allowNull: true },
      decidedBy: { type: Sequelize.UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('CoverClaims', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('CoverClaims');
    await queryInterface.removeColumn('Transactions', 'coverPolicyNumber');
    await queryInterface.removeColumn('Transactions', 'coverPremium');
  },
};
