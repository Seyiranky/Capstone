'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Matches', 'origin', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'manual',
    });
    await queryInterface.addColumn('Matches', 'respondedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // Separate from respondedAt so a match cancelled *after* acceptance is not
    // counted as a decline when computing acceptance rate.
    await queryInterface.addColumn('Matches', 'acceptedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Matches', 'declineReason', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Matches', 'scoreBreakdown', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    // No FK yet: MatchWeightProfiles is introduced in a later migration, which
    // adds the constraint once the table exists.
    await queryInterface.addColumn('Matches', 'weightProfileId', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addIndex('Matches', ['origin']);

    // Matches created before this migration all came from the manual
    // apply -> admin-approve path and were born 'accepted', so their response
    // time is their creation time.
    await queryInterface.sequelize.query(
      `UPDATE "Matches"
       SET "respondedAt" = "createdAt", "acceptedAt" = "createdAt"
       WHERE "status" <> 'pending'`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Matches', ['origin']);
    await queryInterface.removeColumn('Matches', 'weightProfileId');
    await queryInterface.removeColumn('Matches', 'scoreBreakdown');
    await queryInterface.removeColumn('Matches', 'declineReason');
    await queryInterface.removeColumn('Matches', 'acceptedAt');
    await queryInterface.removeColumn('Matches', 'respondedAt');
    await queryInterface.removeColumn('Matches', 'origin');
  },
};
