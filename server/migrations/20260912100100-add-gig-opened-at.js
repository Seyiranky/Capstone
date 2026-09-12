'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Gigs', 'openedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Backfill so time-to-first-match is computable for gigs that were already
    // approved before this column existed.
    await queryInterface.sequelize.query(
      `UPDATE "Gigs" SET "openedAt" = "updatedAt"
       WHERE "status" IN ('open', 'matched', 'completed')`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Gigs', 'openedAt');
  },
};
