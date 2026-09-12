'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('GigApplications', 'rankScore', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('GigApplications', 'scoreBreakdown', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('GigApplications', 'weightProfileId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'MatchWeightProfiles', key: 'id' },
      onDelete: 'SET NULL',
    });

    // Matches.weightProfileId was added before MatchWeightProfiles existed, so
    // its foreign key is only enforceable now.
    await queryInterface.addConstraint('Matches', {
      fields: ['weightProfileId'],
      type: 'foreign key',
      name: 'Matches_weightProfileId_fkey',
      references: { table: 'MatchWeightProfiles', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeConstraint('Matches', 'Matches_weightProfileId_fkey');
    await queryInterface.removeColumn('GigApplications', 'weightProfileId');
    await queryInterface.removeColumn('GigApplications', 'scoreBreakdown');
    await queryInterface.removeColumn('GigApplications', 'rankScore');
  },
};
