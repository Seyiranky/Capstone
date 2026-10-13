'use strict';

const crypto = require('crypto');

// Mirrors generateReceiptNumber in src/services/escrowRules.ts. Duplicated
// because migrations are plain JS run by sequelize-cli and cannot import the
// TypeScript source.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const receiptNumber = () => {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return `ISK-${chars.slice(0, 4)}-${chars.slice(4)}`;
};

/**
 * Lets a worker name their price, and gives every payout a receipt.
 *
 * A quote travels from the application to the match (agreedAmount), and the
 * agreed amount is what escrow collects. Each release gets a receipt number a
 * lender can look up; payouts released before this existed are numbered now so
 * an income statement has no gaps.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('GigApplications', 'quoteAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('GigApplications', 'quoteNote', {
      type: Sequelize.STRING(280),
      allowNull: true,
    });
    await queryInterface.addColumn('Matches', 'agreedAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('Transactions', 'receiptNumber', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM "Transactions" WHERE "escrowStatus" = 'released' AND "receiptNumber" IS NULL`,
    );
    for (const row of rows) {
      await queryInterface.sequelize.query(
        `UPDATE "Transactions" SET "receiptNumber" = :number WHERE id = :id`,
        { replacements: { number: receiptNumber(), id: row.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Transactions', 'receiptNumber');
    await queryInterface.removeColumn('Matches', 'agreedAmount');
    await queryInterface.removeColumn('GigApplications', 'quoteNote');
    await queryInterface.removeColumn('GigApplications', 'quoteAmount');
  },
};
