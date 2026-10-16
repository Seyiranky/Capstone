'use strict';

/**
 * Disputes can now be opened after a job is done: record the stage it was
 * opened at, and, for a paid job, what the worker owes back and the support
 * request that arranges it.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Disputes', 'stage', { type: Sequelize.STRING, allowNull: false, defaultValue: 'in_progress' });
    await queryInterface.addColumn('Disputes', 'refundDue', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
    await queryInterface.addColumn('Disputes', 'supportTicketId', { type: Sequelize.UUID, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Disputes', 'supportTicketId');
    await queryInterface.removeColumn('Disputes', 'refundDue');
    await queryInterface.removeColumn('Disputes', 'stage');
  },
};
