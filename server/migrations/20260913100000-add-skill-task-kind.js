'use strict';

// A certificate sighting is a skill task of a different kind, not a separate
// subsystem. That one distinction is what lets credentials inherit reviewer
// rotation, repeat-pairing limits, prior-relationship exclusion, the seeded
// draw, quorum and appeals without any of it being rewritten.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('SkillTasks', 'kind', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'demonstration',
    });
    // What the worker says the document is. Never trusted on its own — a
    // reviewer sights it, and even then the claim is "this was seen", not
    // "this is genuine".
    await queryInterface.addColumn('SkillTasks', 'claim', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addIndex('SkillTasks', ['kind']);

    await queryInterface.sequelize.query(
      `UPDATE "SkillTasks" SET "kind" = 'demonstration' WHERE "kind" IS NULL`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('SkillTasks', ['kind']);
    await queryInterface.removeColumn('SkillTasks', 'claim');
    await queryInterface.removeColumn('SkillTasks', 'kind');
  },
};
