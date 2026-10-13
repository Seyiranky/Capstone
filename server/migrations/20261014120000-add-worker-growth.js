'use strict';

/**
 * What a worker tells the platform about themselves beyond their skills:
 * whether they are taking work, until when they are away, and the monthly
 * earnings they are aiming for.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'availability', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'available',
    });
    await queryInterface.addColumn('Users', 'availableFrom', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Users', 'monthlyGoal', { type: Sequelize.INTEGER, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'monthlyGoal');
    await queryInterface.removeColumn('Users', 'availableFrom');
    await queryInterface.removeColumn('Users', 'availability');
  },
};
