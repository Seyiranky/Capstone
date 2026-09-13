'use strict';

// Four skill rows gave matching almost no resolution: a tailor doing bridal
// wear scored identically to one doing school uniforms. Specialisations sit
// under the existing categories rather than replacing them, so every current
// reference to a category row keeps working.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Skills', 'parentId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'Skills', key: 'id' },
      onDelete: 'CASCADE',
    });
    await queryInterface.addColumn('Skills', 'kind', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'category',
    });
    await queryInterface.addColumn('Skills', 'sortOrder', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addIndex('Skills', ['parentId']);
    await queryInterface.addIndex('Skills', ['kind']);

    // Everything that exists today is a category by definition.
    await queryInterface.sequelize.query(
      `UPDATE "Skills" SET "kind" = 'category' WHERE "parentId" IS NULL`,
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Skills', ['kind']);
    await queryInterface.removeIndex('Skills', ['parentId']);
    await queryInterface.removeColumn('Skills', 'sortOrder');
    await queryInterface.removeColumn('Skills', 'kind');
    await queryInterface.removeColumn('Skills', 'parentId');
  },
};
