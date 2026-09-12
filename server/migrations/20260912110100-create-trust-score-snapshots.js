'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Append-only history: the RQ3 time series, and the audit trail behind the
    // trust breakdown shown to users.
    await queryInterface.createTable('TrustScoreSnapshots', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      score: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      components: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      formulaVersion: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      trigger: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('TrustScoreSnapshots', ['userId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('TrustScoreSnapshots');
  },
};
