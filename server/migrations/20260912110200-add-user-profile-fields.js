'use strict';

// FR-2 (preferred interface language) and FR-3 (prior experience, CV,
// certificates), plus the notification-channel opt-ins FR-13 needs.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'preferredLanguage', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'en',
    });
    await queryInterface.addColumn('Users', 'experienceSummary', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'cvUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'certificateUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'smsNotificationsEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('Users', 'emailNotificationsEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Users', 'emailNotificationsEnabled');
    await queryInterface.removeColumn('Users', 'smsNotificationsEnabled');
    await queryInterface.removeColumn('Users', 'phone');
    await queryInterface.removeColumn('Users', 'certificateUrl');
    await queryInterface.removeColumn('Users', 'cvUrl');
    await queryInterface.removeColumn('Users', 'experienceSummary');
    await queryInterface.removeColumn('Users', 'preferredLanguage');
  },
};
