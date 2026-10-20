'use strict';

/**
 * Job-flow fixes (SUBMISSION_PLAN Phase 1b).
 *
 * - Matches.cancelledVia: who called a job off after it was accepted (worker,
 *   client) or that a dispute did. The completion rate counts a call-off
 *   against that person only; older rows, without it, still count for both.
 * - Matches.workDoneRemindedAt: the client was reminded, once, that the worker
 *   said the work is finished (Matches.workDoneAt, an existing column).
 * - Transactions.previousAttempts: failed Mobile Money attempts on this job,
 *   kept when the client tries again instead of being overwritten.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Matches', 'cancelledVia', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('Matches', 'workDoneRemindedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('Transactions', 'previousAttempts', { type: Sequelize.JSONB, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Transactions', 'previousAttempts');
    await queryInterface.removeColumn('Matches', 'workDoneRemindedAt');
    await queryInterface.removeColumn('Matches', 'cancelledVia');
  },
};
