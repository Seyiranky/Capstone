'use strict';

/**
 * Holds a client's payment in escrow between acceptance and completion.
 *
 * Until now payment was only requested after a job was marked complete, so
 * nothing protected either side while the work happened. A transaction now
 * opens when the worker accepts; once funded it is `held`, and it is released
 * by the completion code the client hands over on site, by the client, or
 * automatically 72 hours after the worker reports the job done.
 *
 * Every confirmed payment that exists today was made after completion, which is
 * exactly a release, so those rows are backfilled as `released`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Transactions', 'escrowStatus', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'none',
    });
    await queryInterface.addColumn('Transactions', 'heldAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Transactions', 'releasedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Transactions', 'refundedAt', { type: Sequelize.DATE, allowNull: true });

    await queryInterface.addColumn('Matches', 'completionCode', { type: Sequelize.STRING(4), allowNull: true });
    await queryInterface.addColumn('Matches', 'completionCodeAttempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('Matches', 'workDoneAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Matches', 'completedVia', { type: Sequelize.STRING, allowNull: true });

    await queryInterface.sequelize.query(`
      UPDATE "Transactions"
         SET "escrowStatus" = 'released',
             "releasedAt" = COALESCE("callbackReceivedAt", "updatedAt")
       WHERE "status" = 'confirmed'
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Matches', 'completedVia');
    await queryInterface.removeColumn('Matches', 'workDoneAt');
    await queryInterface.removeColumn('Matches', 'completionCodeAttempts');
    await queryInterface.removeColumn('Matches', 'completionCode');
    await queryInterface.removeColumn('Transactions', 'refundedAt');
    await queryInterface.removeColumn('Transactions', 'releasedAt');
    await queryInterface.removeColumn('Transactions', 'heldAt');
    await queryInterface.removeColumn('Transactions', 'escrowStatus');
  },
};
