'use strict';

/**
 * Voice notes on messages and on gig posts.
 *
 * Many clients and workers are more at ease speaking Kinyarwanda than typing
 * it, and a minute of speech describes a broken phone or a dress better than
 * a paragraph. A message can carry a voice note in place of text, and a gig
 * can carry one beside its written description.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const [table, prefix] of [
      ['Messages', 'audio'],
      ['Gigs', 'voiceNote'],
    ]) {
      await queryInterface.addColumn(table, `${prefix}Url`, { type: Sequelize.STRING, allowNull: true });
      await queryInterface.addColumn(table, `${prefix}MimeType`, { type: Sequelize.STRING, allowNull: true });
      await queryInterface.addColumn(table, `${prefix}DurationSec`, { type: Sequelize.INTEGER, allowNull: true });
    }
  },

  async down(queryInterface) {
    for (const [table, prefix] of [
      ['Messages', 'audio'],
      ['Gigs', 'voiceNote'],
    ]) {
      await queryInterface.removeColumn(table, `${prefix}Url`);
      await queryInterface.removeColumn(table, `${prefix}MimeType`);
      await queryInterface.removeColumn(table, `${prefix}DurationSec`);
    }
  },
};
