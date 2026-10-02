'use strict';

/**
 * Replaces the two independent notification booleans with one exclusive
 * preference, and adds the columns needed to verify an email address before
 * anything is sent to it.
 *
 * `smsNotificationsEnabled` and `emailNotificationsEnabled` could both be true
 * at once — a state the UI cannot produce and which left `notify` with no
 * answer for which channel to use. A single column cannot disagree with itself.
 *
 * The backfill runs before the drop so no expressed preference is lost. SMS
 * wins when both are set: it is the channel that actually delivers today.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'preferredChannel', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'none',
    });
    await queryInterface.addColumn('Users', 'emailVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'emailVerificationToken', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Users', 'emailVerificationExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Users" SET "preferredChannel" =
        CASE WHEN "smsNotificationsEnabled"   THEN 'sms'
             WHEN "emailNotificationsEnabled" THEN 'email'
             ELSE 'none' END
    `);

    await queryInterface.removeColumn('Users', 'smsNotificationsEnabled');
    await queryInterface.removeColumn('Users', 'emailNotificationsEnabled');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'smsNotificationsEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('Users', 'emailNotificationsEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Repopulate from the single column so the rollback is lossless for every
    // preference this schema was able to represent.
    await queryInterface.sequelize.query(`
      UPDATE "Users"
         SET "smsNotificationsEnabled"   = ("preferredChannel" = 'sms'),
             "emailNotificationsEnabled" = ("preferredChannel" = 'email')
    `);

    await queryInterface.removeColumn('Users', 'emailVerificationExpiresAt');
    await queryInterface.removeColumn('Users', 'emailVerificationToken');
    await queryInterface.removeColumn('Users', 'emailVerifiedAt');
    await queryInterface.removeColumn('Users', 'preferredChannel');
  },
};
