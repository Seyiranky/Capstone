'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // The portable, verifiable record of competence the problem statement calls
    // for: something a worker can show a client off-platform and that the
    // client can check without an account.
    await queryInterface.createTable('SkillPassports', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // The jti of the signed token, checked on every lookup so a passport can
      // be revoked rather than living as long as its signature.
      tokenId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      issuedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('SkillPassports', ['userId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SkillPassports');
  },
};
