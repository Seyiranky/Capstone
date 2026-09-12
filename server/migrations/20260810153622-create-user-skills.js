'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('UserSkills', {
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
      skillId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Skills', key: 'id' },
        onDelete: 'CASCADE',
      },
      proficiencyLevel: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      verificationStatus: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'unverified',
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

    await queryInterface.addIndex('UserSkills', ['userId', 'skillId'], {
      unique: true,
      name: 'user_skills_user_id_skill_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('UserSkills');
  },
};
