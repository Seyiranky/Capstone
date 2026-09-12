'use strict';

// A reviewer *capability* rather than a revived 'mentor' role. With only two or
// three admins, rotation and repeat-pairing limits are mathematically
// impossible, so RQ1 could not be answered at all; enrolling trusted workers as
// peer reviewers makes the mechanism real. This is additive, so it avoids
// churning auth and role middleware the way re-adding the role would.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'reviewerTier', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addIndex('Users', ['reviewerTier']);

    // Every existing admin already acts as a reviewer.
    await queryInterface.sequelize.query(
      `UPDATE "Users" SET "reviewerTier" = 'admin' WHERE "role" = 'admin'`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Users', ['reviewerTier']);
    await queryInterface.removeColumn('Users', 'reviewerTier');
  },
};
