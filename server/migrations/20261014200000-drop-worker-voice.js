'use strict';

/** Worker Voice was removed from the product; its tables go with it. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('PollVotes');
    await queryInterface.dropTable('Polls');
  },
  async down() {
    // Recreate with 20261014170000-add-worker-voice if it ever returns.
  },
};
