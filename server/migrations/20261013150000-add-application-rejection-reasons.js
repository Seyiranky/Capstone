'use strict';

/**
 * Says why an application was turned down.
 *
 * A worker told only "not selected" learns nothing. A reason, and for a skill
 * gap a route to verifying that skill, turns the rejection into a next step,
 * and the counts by skill show admins where training is needed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('GigApplications', 'rejectionReason', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('GigApplications', 'rejectionNote', {
      type: Sequelize.STRING(280),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('GigApplications', 'rejectionNote');
    await queryInterface.removeColumn('GigApplications', 'rejectionReason');
  },
};
