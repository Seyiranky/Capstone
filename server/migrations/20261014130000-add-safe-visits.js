'use strict';

/**
 * Safe visits for on-site work.
 *
 * Most Isoko jobs happen in a stranger's home or shop. A worker can name a
 * trusted contact, check in on arrival and out on leaving (the contact gets an
 * SMS each time), and raise an SOS that reaches the contact and every admin at
 * once. Each step is a safety event, kept for the record.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'trustedContactName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('Users', 'trustedContactPhone', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.createTable('SafetyEvents', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      kind: { type: Sequelize.STRING, allowNull: false },
      lat: { type: Sequelize.DOUBLE, allowNull: true },
      lng: { type: Sequelize.DOUBLE, allowNull: true },
      contactNotified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      resolvedBy: { type: Sequelize.UUID, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('SafetyEvents', ['matchId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SafetyEvents');
    await queryInterface.removeColumn('Users', 'trustedContactPhone');
    await queryInterface.removeColumn('Users', 'trustedContactName');
  },
};
