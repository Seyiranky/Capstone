'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // One mechanism, two consumers. A provider retrying a webhook and a phone
    // replaying a queued action after coming back online are the same problem:
    // the same intent arriving twice must produce one effect and the same
    // answer both times.
    await queryInterface.createTable('IdempotencyKeys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      scope: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      // Replayed verbatim, so a retry sees exactly what the first attempt
      // returned rather than a second, differently-shaped success.
      statusCode: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      responseBody: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      completedAt: {
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

    await queryInterface.addConstraint('IdempotencyKeys', {
      fields: ['scope', 'key'],
      type: 'unique',
      name: 'IdempotencyKeys_scope_key_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('IdempotencyKeys');
  },
};
