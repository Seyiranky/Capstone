'use strict';
const { randomUUID } = require('crypto');

const SKILLS = [
  { category: 'electronics_repair', name: 'Phone & Electronics Repair' },
  { category: 'tailoring', name: 'Tailoring & Garment Making' },
  { category: 'tutoring', name: 'Academic Tutoring' },
  { category: 'digital_web', name: 'Digital & Web Services' },
];

module.exports = {
  // Safe to run again: it inserts only the categories that are missing. Running
  // it twice used to add a second copy of every category, which then showed
  // up twice in every skill picker.
  async up(queryInterface) {
    const now = new Date();
    const [existing] = await queryInterface.sequelize.query(
      'SELECT name FROM "Skills" WHERE "parentId" IS NULL',
    );
    const have = new Set(existing.map((row) => row.name));
    const missing = SKILLS.filter((skill) => !have.has(skill.name));
    if (missing.length === 0) return;
    await queryInterface.bulkInsert(
      'Skills',
      missing.map((skill) => ({
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
