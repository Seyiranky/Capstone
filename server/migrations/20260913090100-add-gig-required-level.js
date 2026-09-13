'use strict';

// Client-declared on the job post and optional. A soft penalty in scoring,
// never a filter: filtering hides workers from a client who cannot then see
// who was excluded or why, which is the opacity this platform argues against.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Gigs', 'requiredLevel', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Gigs', 'requiredLevel');
  },
};
