'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // An appeal forces reassignment excluding every prior reviewer, which is
    // the worker's recourse against a reviewer acting in bad faith.
    await queryInterface.createTable('SkillTaskAppeals', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'SkillTasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      workerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'open',
      },
      resolutionNotes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decidedBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL',
      },
      decidedAt: {
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

    await queryInterface.addIndex('SkillTaskAppeals', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SkillTaskAppeals');
  },
};
