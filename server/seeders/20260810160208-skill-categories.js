'use strict';
const { randomUUID } = require('crypto');

const SKILLS = [
  { category: 'electronics_repair', name: 'Phone & Electronics Repair' },
  { category: 'tailoring', name: 'Tailoring & Garment Making' },
  { category: 'tutoring', name: 'Academic Tutoring' },
  { category: 'digital_web', name: 'Digital & Web Services' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'Skills',
      SKILLS.map((skill) => ({
        id: randomUUID(),
        category: skill.category,
        name: skill.name,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },

  async down(queryInterface) {
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('Skills', {
      category: { [Op.in]: SKILLS.map((skill) => skill.category) },
    });
  },
};
