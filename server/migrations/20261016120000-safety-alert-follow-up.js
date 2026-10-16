'use strict';

/** Who saw an SOS or overdue alert and when, and what was done about it. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SafetyEvents', 'acknowledgedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('SafetyEvents', 'acknowledgedBy', { type: Sequelize.UUID, allowNull: true });
    await queryInterface.addColumn('SafetyEvents', 'resolutionNote', { type: Sequelize.TEXT, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('SafetyEvents', 'resolutionNote');
    await queryInterface.removeColumn('SafetyEvents', 'acknowledgedBy');
    await queryInterface.removeColumn('SafetyEvents', 'acknowledgedAt');
  },
};
