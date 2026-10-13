'use strict';

/**
 * Lets a message carry a photo.
 *
 * Workers and clients settle details by showing each other things: the broken
 * screen, the fabric, the finished hem. A photo-only message has an empty body,
 * so the body gets a default rather than a looser NOT NULL.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Messages', 'imageUrl', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('Messages', 'imageMimeType', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('Messages', 'imageSha256', { type: Sequelize.STRING(64), allowNull: true });
    await queryInterface.changeColumn('Messages', 'body', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: '',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Messages', 'body', { type: Sequelize.TEXT, allowNull: false });
    await queryInterface.removeColumn('Messages', 'imageSha256');
    await queryInterface.removeColumn('Messages', 'imageMimeType');
    await queryInterface.removeColumn('Messages', 'imageUrl');
  },
};
