'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // A randomisation list fixed before recruitment begins. Holding the
    // sequence as data, rather than deciding each arm at registration time, is
    // what allocation concealment means: the person signing participants up
    // cannot see or influence which arm comes next, and the list can be shown
    // to an examiner as evidence it predated the pilot.
    await queryInterface.createTable('ExperimentAllocations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      experiment: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'rq3_provenance',
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      blockIndex: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      blockSize: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      arm: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      // Recorded so the whole sequence can be regenerated and checked.
      seed: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      claimedByUserId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL',
      },
      claimedAt: {
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

    await queryInterface.addConstraint('ExperimentAllocations', {
      fields: ['experiment', 'position'],
      type: 'unique',
      name: 'ExperimentAllocations_experiment_position_unique',
    });
    // The claim query looks for the lowest unclaimed position in an experiment.
    await queryInterface.addIndex('ExperimentAllocations', ['experiment', 'claimedByUserId', 'position']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ExperimentAllocations');
  },
};
