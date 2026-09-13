'use strict';
const { randomUUID } = require('crypto');

/**
 * Curated specialisations under each existing category.
 *
 * Deliberately a fixed vocabulary rather than worker-authored tags: RQ2
 * compares ranking behaviour across candidates, and free text would make two
 * workers doing the same job incomparable. Chosen to reflect work actually
 * advertised in Kigali rather than an abstract taxonomy.
 */
const SPECIALISATIONS = {
  electronics_repair: [
    'Phone screen & charging port repair',
    'Laptop & computer repair',
    'TV & home appliance repair',
    'Battery & power supply',
    'Software & data recovery',
  ],
  tailoring: [
    'School uniforms',
    'Bridal & occasion wear',
    'Alterations & repairs',
    'Curtains & home furnishing',
    'Traditional & kitenge wear',
    'Bulk & workwear orders',
  ],
  tutoring: [
    'Mathematics',
    'Sciences (Physics, Chemistry, Biology)',
    'English language',
    'French language',
    'Primary school support',
    'National exam preparation',
  ],
  digital_web: [
    'Website design & build',
    'Social media & content',
    'Graphic design & branding',
    'Data entry & admin support',
    'Photography & video editing',
  ],
};

module.exports = {
  async up(queryInterface) {
    const [parents] = await queryInterface.sequelize.query(
      `SELECT id, category FROM "Skills" WHERE "parentId" IS NULL;`,
    );
    const parentByCategory = Object.fromEntries(parents.map((p) => [p.category, p.id]));

    const now = new Date();
    const rows = [];
    for (const [category, names] of Object.entries(SPECIALISATIONS)) {
      const parentId = parentByCategory[category];
      if (!parentId) continue;
      names.forEach((name, index) => {
        rows.push({
          id: randomUUID(),
          // Specialisations keep their parent's category, so anything that
          // filters or groups by category keeps working unchanged.
          category,
          name,
          parentId,
          kind: 'specialisation',
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        });
      });
    }

    if (rows.length) {
      await queryInterface.bulkInsert('Skills', rows);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Skills', { kind: 'specialisation' });
  },
};
