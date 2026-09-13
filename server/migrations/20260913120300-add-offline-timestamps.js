'use strict';

// An action taken offline at 09:00 and synced at 15:00 would otherwise be
// recorded as having happened at 15:00, so time-to-first-match and response
// latency would measure connectivity rather than behaviour. Keeping both lets
// the analysis report each, and the gap between them is itself a finding about
// how these workers actually use the platform.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Matches', 'respondedOccurredAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Matches', 'wasQueuedOffline', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('GigApplications', 'occurredAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('GigApplications', 'wasQueuedOffline', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('GigApplications', 'wasQueuedOffline');
    await queryInterface.removeColumn('GigApplications', 'occurredAt');
    await queryInterface.removeColumn('Matches', 'wasQueuedOffline');
    await queryInterface.removeColumn('Matches', 'respondedOccurredAt');
  },
};
