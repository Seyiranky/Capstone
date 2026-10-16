'use strict';

/** When the client was reminded of an unanswered application, and when it expired unanswered. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('GigApplications', 'remindedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('GigApplications', 'expiredAt', { type: Sequelize.DATE, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('GigApplications', 'expiredAt');
    await queryInterface.removeColumn('GigApplications', 'remindedAt');
  },
};
