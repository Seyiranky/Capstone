'use strict';

/** A profile picture, cropped square in the browser and stored under /uploads/avatars. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'avatarUrl', { type: Sequelize.STRING, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'avatarUrl');
  },
};
