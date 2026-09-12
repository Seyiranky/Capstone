'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Replaces the single pasted evidenceUrl. Workers in the target group are
    // often low-literacy and on low-end Android, so a photo or a spoken note
    // is a far more realistic form of proof than a hosted link.
    await queryInterface.createTable('SkillTaskEvidences', {
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
      kind: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      mimeType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      sizeBytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      durationSec: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      // Lets a reviewer's decision be tied to the exact bytes they saw, so
      // evidence cannot be swapped after approval.
      sha256: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      capturedAt: {
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

    await queryInterface.addIndex('SkillTaskEvidences', ['taskId']);

    // Carry existing single-link evidence over so no submission loses its proof.
    await queryInterface.sequelize.query(
      `INSERT INTO "SkillTaskEvidences" ("id", "taskId", "kind", "url", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), t."id", 'link', t."evidenceUrl", t."createdAt", t."updatedAt"
       FROM "SkillTasks" t
       WHERE t."evidenceUrl" IS NOT NULL AND t."evidenceUrl" <> ''`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SkillTaskEvidences');
  },
};
