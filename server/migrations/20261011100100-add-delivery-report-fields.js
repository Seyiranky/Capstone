'use strict';

/**
 * Records what happened to an SMS after the gateway accepted it.
 *
 * Until now "sent" was the last thing known: Pindo had taken the message, and
 * whether a phone ever received it was invisible. Pindo reports that per
 * message to a webhook; these columns hold the answer, and what each message
 * cost, so a pilot can report reach and spend rather than attempts.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('NotificationDeliveries', 'deliveredAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('NotificationDeliveries', 'providerStatus', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('NotificationDeliveries', 'segments', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('NotificationDeliveries', 'cost', {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: true,
    });
    // The webhook finds its row by the gateway's message id.
    await queryInterface.addIndex('NotificationDeliveries', ['provider', 'providerMessageId']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('NotificationDeliveries', ['provider', 'providerMessageId']);
    await queryInterface.removeColumn('NotificationDeliveries', 'cost');
    await queryInterface.removeColumn('NotificationDeliveries', 'segments');
    await queryInterface.removeColumn('NotificationDeliveries', 'providerStatus');
    await queryInterface.removeColumn('NotificationDeliveries', 'deliveredAt');
  },
};
