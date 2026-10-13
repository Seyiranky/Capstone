'use strict';

/**
 * Two protections against fraud between clients and workers.
 *
 * Messages carry a flag when they share contact details or talk about paying
 * outside the platform, so the app can remind both people that only money in
 * escrow is protected. And anyone can report a user to the admins, who review
 * the report and can suspend the account.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Messages', 'offPlatformFlag', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.createTable('Reports', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      reporterId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      reportedUserId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      reason: { type: Sequelize.STRING, allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'open' },
      resolvedBy: { type: Sequelize.UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      resolutionNote: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('Reports', ['reportedUserId']);
    await queryInterface.addIndex('Reports', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Reports');
    await queryInterface.removeColumn('Messages', 'offPlatformFlag');
  },
};
