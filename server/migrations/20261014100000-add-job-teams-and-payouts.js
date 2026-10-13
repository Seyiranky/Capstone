'use strict';

/**
 * More than one person on a job: crew members and an apprentice, and a payout
 * for each of them.
 *
 * Until now one job paid one worker, so the transaction was the payout. A team
 * needs one payout per person, each with its own receipt, so that income
 * statements and work histories show each person their own share. Every
 * payout already made is backfilled as a single payout to the job's worker,
 * keeping its receipt number.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MatchMembers', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: { type: Sequelize.STRING, allowNull: false },
      sharePercent: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'invited' },
      joinedAt: { type: Sequelize.DATE, allowNull: true },
      endorsement: { type: Sequelize.STRING, allowNull: true },
      endorsementNote: { type: Sequelize.STRING(280), allowNull: true },
      endorsedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('MatchMembers', ['matchId', 'userId'], { unique: true });

    await queryInterface.createTable('Payouts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      transactionId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Transactions', key: 'id' },
        onDelete: 'CASCADE',
      },
      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Matches', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: { type: Sequelize.STRING, allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING, allowNull: false, defaultValue: 'RWF' },
      receiptNumber: { type: Sequelize.STRING, allowNull: false, unique: true },
      releasedAt: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('Payouts', ['userId']);

    await queryInterface.addColumn('GigApplications', 'crew', { type: Sequelize.JSONB, allowNull: true });

    // One payout per job already paid, to the job's worker, under the job's receipt.
    await queryInterface.sequelize.query(`
      INSERT INTO "Payouts" (id, "transactionId", "matchId", "userId", role, amount, currency,
                             "receiptNumber", "releasedAt", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), t.id, t."matchId", m."workerId", 'lead',
             COALESCE(t."releasedAmount", t.amount), t.currency, t."receiptNumber",
             COALESCE(t."releasedAt", t."updatedAt"), NOW(), NOW()
        FROM "Transactions" t
        JOIN "Matches" m ON m.id = t."matchId"
       WHERE t."escrowStatus" = 'released' AND t."receiptNumber" IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('GigApplications', 'crew');
    await queryInterface.dropTable('Payouts');
    await queryInterface.dropTable('MatchMembers');
  },
};
