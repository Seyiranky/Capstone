'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("UPDATE \"Users\" SET role = 'admin' WHERE role = 'mentor'");
  },

  async down() {
    // One-way cleanup — the original mentor/admin split is not recoverable.
  },
};
