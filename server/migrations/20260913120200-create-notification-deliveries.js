'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // FR-13 promises SMS and email alongside in-app. Delivery is the part that
    // actually fails in the field — a wrong number, no credit, a carrier
    // rejection — and without a record of each attempt the pilot cannot report
    // whether anyone was reached, only that the platform tried.
    await queryInterface.createTable('NotificationDeliveries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      notificationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Notifications', key: 'id' },
        onDelete: 'CASCADE',
      },
      channel: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      provider: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      providerMessageId: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      sentAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('NotificationDeliveries', ['notificationId']);
    await queryInterface.addIndex('NotificationDeliveries', ['channel', 'status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('NotificationDeliveries');
  },
};
