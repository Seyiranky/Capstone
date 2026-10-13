'use strict';

/**
 * Worker Voice: workers vote on platform rules.
 *
 * An admin posts a poll; any worker with at least one paid job votes once;
 * the counts are public; and a closed poll must carry the platform's
 * response, so a vote is never asked for and then ignored in silence.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Polls', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      question: { type: Sequelize.STRING(200), allowNull: false },
      details: { type: Sequelize.TEXT, allowNull: true },
      options: { type: Sequelize.JSONB, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'open' },
      closesAt: { type: Sequelize.DATE, allowNull: false },
      createdBy: { type: Sequelize.UUID, allowNull: true, references: { model: 'Users', key: 'id' }, onDelete: 'SET NULL' },
      outcome: { type: Sequelize.TEXT, allowNull: true },
      closedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.createTable('PollVotes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      pollId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Polls', key: 'id' }, onDelete: 'CASCADE' },
      userId: { type: Sequelize.UUID, allowNull: false, references: { model: 'Users', key: 'id' }, onDelete: 'CASCADE' },
      optionIndex: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('PollVotes', ['pollId', 'userId'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('PollVotes');
    await queryInterface.dropTable('Polls');
  },
};
