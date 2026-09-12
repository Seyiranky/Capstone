'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'trustScoreBreakdown', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'trustScoreUpdatedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'reviewCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('Users', 'completedJobCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('Users', 'abandonedJobCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Users', 'abandonedJobCount');
    await queryInterface.removeColumn('Users', 'completedJobCount');
    await queryInterface.removeColumn('Users', 'reviewCount');
    await queryInterface.removeColumn('Users', 'trustScoreUpdatedAt');
    await queryInterface.removeColumn('Users', 'trustScoreBreakdown');
  },
};
