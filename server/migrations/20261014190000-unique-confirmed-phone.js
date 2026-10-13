'use strict';

/**
 * A confirmed phone number belongs to one account: it identifies the caller on
 * USSD and receives safety texts. Unconfirmed numbers are not constrained, so a
 * typo on one account cannot block another from confirming their own number.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('Users', ['phone'], {
      name: 'users_confirmed_phone_unique',
      unique: true,
      where: { phoneVerifiedAt: { [require('sequelize').Op.ne]: null } },
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('Users', 'users_confirmed_phone_unique');
  },
};
