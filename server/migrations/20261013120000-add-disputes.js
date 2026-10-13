'use strict';

/**
 * Disputes over escrowed money, judged by screened peers.
 *
 * Either party can open one while money is held; that freezes release. Three
 * mediators are drawn from high-trust users with no tie to either party and no
 * collusion flag, and the seed of the draw is kept so the panel can be shown
 * not to have been steered. A split decision needs to release part of the
 * money, hence releasedAmount on the transaction.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Disputes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      openedById: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      reason: { type: Sequelize.STRING, allowNull: false },
      details: { type: Sequelize.TEXT, allowNull: false },
      response: { type: Sequelize.TEXT, allowNull: true },
      respondedAt: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'open' },
      outcome: { type: Sequelize.STRING, allowNull: true },
      decidedBy: { type: Sequelize.STRING, allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      adminId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL',
      },
      adminNote: { type: Sequelize.TEXT, allowNull: true },
      deadlineAt: { type: Sequelize.DATE, allowNull: false },
      panelSeed: { type: Sequelize.STRING, allowNull: true },
      panelPoolSize: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    // At most one live dispute per job; a settled one does not block another.
    await queryInterface.addIndex('Disputes', ['matchId'], {
      unique: true,
      where: { status: ['open', 'escalated'] },
      name: 'disputes_one_live_per_match',
    });

    await queryInterface.createTable('DisputeVotes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      disputeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Disputes', key: 'id' },
        onDelete: 'CASCADE',
      },
      mediatorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      vote: { type: Sequelize.STRING, allowNull: true },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      votedAt: { type: Sequelize.DATE, allowNull: true },
      withMajority: { type: Sequelize.BOOLEAN, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('DisputeVotes', ['disputeId', 'mediatorId'], { unique: true });

    await queryInterface.addColumn('Transactions', 'releasedAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Transactions', 'releasedAmount');
    await queryInterface.dropTable('DisputeVotes');
    await queryInterface.dropTable('Disputes');
  },
};
