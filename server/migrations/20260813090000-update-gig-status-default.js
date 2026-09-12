'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Gigs', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pending_review',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Gigs', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'open',
    });
  },
};
