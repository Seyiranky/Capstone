'use strict';

/**
 * Gigs involving children or working inside someone's home are "sensitive":
 * applying to one needs a stronger record. `sensitiveBy` says who marked it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Gigs', 'sensitive', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('Gigs', 'sensitiveBy', { type: Sequelize.STRING, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Gigs', 'sensitiveBy');
    await queryInterface.removeColumn('Gigs', 'sensitive');
  },
};
