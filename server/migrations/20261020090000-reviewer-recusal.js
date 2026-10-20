'use strict';

/**
 * Why a reviewer stepped aside from a skill submission: they know the worker,
 * have another conflict, or do not feel qualified. A recusal is the reviewer
 * disclosing a relationship (FR-5), so it is kept as data for the RQ1 audit.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SkillTaskAssignments', 'recusalReason', { type: Sequelize.STRING, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('SkillTaskAssignments', 'recusalReason');
  },
};
