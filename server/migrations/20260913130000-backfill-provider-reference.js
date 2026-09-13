'use strict';

// Every transaction written before the provider columns existed has a null
// providerReference, which means a callback can never match it — those payments
// would have been permanently unsettleable by webhook. Under the old scheme the
// local reference *was* the provider's, so copying it across is exact rather
// than a guess.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE "Transactions"
       SET "providerReference" = "reference",
           "providerStatus" = CASE
             WHEN "status" = 'confirmed' THEN 'SUCCESSFUL'
             WHEN "status" = 'failed' THEN 'FAILED'
             ELSE 'PENDING'
           END
       WHERE "providerReference" IS NULL AND "reference" IS NOT NULL`,
    );
  },

  down: async (queryInterface) => {
    // Only clears what this migration filled; rows written since keep theirs.
    await queryInterface.sequelize.query(
      `UPDATE "Transactions"
       SET "providerReference" = NULL, "providerStatus" = NULL
       WHERE "providerReference" = "reference"`,
    );
  },
};
