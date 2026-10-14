'use strict';

/**
 * Mobile Money payment instead of escrow.
 *
 * Nothing is collected when a job starts any more; the client pays with MoMo
 * once it is done. So Job Cover, which starts while the job is under way, is
 * recorded on the match (its premium is billed in the final payment), a match
 * remembers when it was completed (for the cover's claim window), and each
 * payout records whether it was sent to the worker's MoMo number.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Matches', 'completedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Matches', 'coverPremium', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn('Matches', 'coverPolicyNumber', { type: Sequelize.STRING, allowNull: true, unique: true });
    await queryInterface.addColumn('Matches', 'coverStartedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Payouts', 'transferStatus', { type: Sequelize.STRING, allowNull: false, defaultValue: 'not_sent' });
    await queryInterface.addColumn('Payouts', 'transferReference', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('Payouts', 'transferError', { type: Sequelize.TEXT, allowNull: true });

    await queryInterface.sequelize.query(
      `UPDATE "Matches" SET "completedAt" = "updatedAt" WHERE "status" = 'completed'`,
    );
    await queryInterface.sequelize.query(`
      UPDATE "Matches" m SET "coverPremium" = t."coverPremium", "coverPolicyNumber" = t."coverPolicyNumber",
        "coverStartedAt" = COALESCE(t."heldAt", t."createdAt")
      FROM "Transactions" t WHERE t."matchId" = m.id AND t."coverPolicyNumber" IS NOT NULL`);
  },

  async down(queryInterface) {
    for (const c of ['completedAt', 'coverPremium', 'coverPolicyNumber', 'coverStartedAt']) {
      await queryInterface.removeColumn('Matches', c);
    }
    for (const c of ['transferStatus', 'transferReference', 'transferError']) {
      await queryInterface.removeColumn('Payouts', c);
    }
  },
};
