'use strict';

/**
 * When the password last changed. Sessions (JWTs) issued before it stop
 * working, so changing or resetting a password signs out every other device.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'passwordChangedAt', { type: Sequelize.DATE, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'passwordChangedAt');
  },
};
