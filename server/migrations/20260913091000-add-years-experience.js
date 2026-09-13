'use strict';

// Years worked is the one experience signal that is trivially expressible by
// someone with no CV and no documents, which is most of this population.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'yearsExperience', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Users', 'yearsExperience');
  },
};
