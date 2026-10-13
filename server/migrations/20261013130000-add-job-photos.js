'use strict';

/**
 * Photos of finished work, attached by the worker to the job they came from.
 *
 * They build the worker's work history, so a completed job becomes evidence on
 * their profile, as a Lynk career profile or a TaskRabbit job photo would. Each
 * is hashed so a photo can be shown to be the one uploaded for that job.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('JobPhotos', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      url: { type: Sequelize.STRING, allowNull: false },
      mimeType: { type: Sequelize.STRING, allowNull: false },
      sizeBytes: { type: Sequelize.INTEGER, allowNull: false },
      sha256: { type: Sequelize.STRING(64), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('JobPhotos', ['matchId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('JobPhotos');
  },
};
