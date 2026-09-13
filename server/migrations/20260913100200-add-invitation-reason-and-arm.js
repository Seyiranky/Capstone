'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // An invitation a newcomer received because a slot was reserved for them is
    // not evidence that the ranking chose them. Pooling the two would quietly
    // contaminate the ranked arm's acceptance rate, which is RQ2's headline.
    await queryInterface.addColumn('Matches', 'invitationReason', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addIndex('Matches', ['invitationReason']);
    await queryInterface.sequelize.query(
      `UPDATE "Matches" SET "invitationReason" = 'ranked' WHERE "origin" = 'ranked'`,
    );

    // RQ3's between-subjects assignment. Added now rather than later because a
    // retrofitted arm loses every observation made before it existed.
    await queryInterface.addColumn('Users', 'experimentArm', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addIndex('Users', ['experimentArm']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Users', ['experimentArm']);
    await queryInterface.removeColumn('Users', 'experimentArm');
    await queryInterface.removeIndex('Matches', ['invitationReason']);
    await queryInterface.removeColumn('Matches', 'invitationReason');
  },
};
