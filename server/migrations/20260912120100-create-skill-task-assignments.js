'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // The reviewer-assignment distribution the evaluation plan audits for RQ1.
    // assignedAt is kept separate from the task's own createdAt so reviewer
    // latency can be told apart from time spent waiting in the queue.
    await queryInterface.createTable('SkillTaskAssignments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'SkillTasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      reviewerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      round: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      confidence: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Recorded so an assignment can be replayed and audited, unlike an
      // unlogged Math.random() draw.
      assignmentSeed: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      eligiblePoolSize: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      assignedAt: {
        type: Sequelize.DATE,
        allowNull: false,
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

    await queryInterface.addIndex('SkillTaskAssignments', ['taskId']);
    await queryInterface.addIndex('SkillTaskAssignments', ['reviewerId']);
    await queryInterface.addConstraint('SkillTaskAssignments', {
      fields: ['taskId', 'reviewerId'],
      type: 'unique',
      name: 'SkillTaskAssignments_task_reviewer_unique',
    });

    await queryInterface.addColumn('SkillTasks', 'requiredApprovals', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn('SkillTasks', 'disagreementFlag', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Backfill an assignment row for tasks that predate per-round tracking, so
    // the audit has no blind spot.
    await queryInterface.sequelize.query(
      `INSERT INTO "SkillTaskAssignments"
         ("id", "taskId", "reviewerId", "round", "status", "assignedAt", "decidedAt", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), t."id", t."reviewerId", 1,
              CASE WHEN t."status" = 'pending' THEN 'pending' ELSE t."status" END,
              t."createdAt", t."reviewedAt", t."createdAt", t."updatedAt"
       FROM "SkillTasks" t
       WHERE t."reviewerId" IS NOT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('SkillTasks', 'disagreementFlag');
    await queryInterface.removeColumn('SkillTasks', 'requiredApprovals');
    await queryInterface.dropTable('SkillTaskAssignments');
  },
};
