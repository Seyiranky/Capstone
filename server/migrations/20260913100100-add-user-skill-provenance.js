'use strict';

// Denormalised onto UserSkills on purpose: matching reads provenance for every
// candidate on every scoring pass, and recomputing it per candidate would mean
// fanning out queries inside the ranking loop.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('UserSkills', 'provenance', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'self_declared',
    });
    await queryInterface.addColumn('UserSkills', 'provenanceDetail', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('UserSkills', 'credentialStrength', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0.15,
    });
    await queryInterface.addColumn('UserSkills', 'selfDeclaredAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addIndex('UserSkills', ['provenance']);

    // Anything already verified got there through an approved demonstration
    // task, which is the peer_reviewed tier. Backfilled here so existing
    // workers are not demoted to self-declared by the new column's default.
    await queryInterface.sequelize.query(
      `UPDATE "UserSkills"
       SET "provenance" = 'peer_reviewed', "credentialStrength" = 0.8
       WHERE "verificationStatus" = 'verified'`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('UserSkills', ['provenance']);
    await queryInterface.removeColumn('UserSkills', 'selfDeclaredAt');
    await queryInterface.removeColumn('UserSkills', 'credentialStrength');
    await queryInterface.removeColumn('UserSkills', 'provenanceDetail');
    await queryInterface.removeColumn('UserSkills', 'provenance');
  },
};
