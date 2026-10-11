'use strict';

/**
 * Adds what is needed to confirm a phone number before SMS is sent to it.
 *
 * Email has been confirmed before use since it was built; SMS sent to whatever
 * `phone` held, so a typo billed Isoko for messages to a stranger. The code
 * itself is never stored -- only a hash -- and attempts are counted so six
 * digits cannot simply be guessed.
 *
 * Anyone already receiving SMS keeps receiving it: their number is treated as
 * confirmed, since the alternative is silently stopping a channel they chose.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'phoneVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'phoneVerificationCodeHash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'phoneVerificationExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'phoneVerificationAttempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Users" SET "phoneVerifiedAt" = NOW()
       WHERE "preferredChannel" = 'sms' AND "phone" IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Users', 'phoneVerificationAttempts');
    await queryInterface.removeColumn('Users', 'phoneVerificationExpiresAt');
    await queryInterface.removeColumn('Users', 'phoneVerificationCodeHash');
    await queryInterface.removeColumn('Users', 'phoneVerifiedAt');
  },
};
