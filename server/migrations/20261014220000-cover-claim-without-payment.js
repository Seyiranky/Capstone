'use strict';

/** A Job Cover claim can come before the job is paid, so its payment is optional. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('CoverClaims', 'transactionId', { type: Sequelize.UUID, allowNull: true });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('CoverClaims', 'transactionId', { type: Sequelize.UUID, allowNull: false });
  },
};
