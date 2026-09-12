'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const DEMO_DOMAIN = '@isoko.demo';
const DEMO_PASSWORD = 'password123';

const ABU = { name: 'Abu Bakar', email: `abu${DEMO_DOMAIN}` };
const SEYI = {
  name: 'Seyi Adebayo',
  email: `seyi${DEMO_DOMAIN}`,
  category: 'digital_web',
  location: { lat: -1.9441, lng: 30.0619 },
  trustScore: 4.6,
};

const EMAILS = [ABU.email, SEYI.email];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const [skillRows] = await queryInterface.sequelize.query(
      'SELECT id, category FROM "Skills";',
    );
    const skillIdByCategory = Object.fromEntries(skillRows.map((s) => [s.category, s.id]));

    const abuId = randomUUID();
    const seyiId = randomUUID();

    await queryInterface.bulkInsert('Users', [
      {
        id: abuId,
        name: ABU.name,
        email: ABU.email,
        passwordHash,
        role: 'admin',
        trustScore: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: seyiId,
        name: SEYI.name,
        email: SEYI.email,
        passwordHash,
        role: 'worker',
        locationLat: SEYI.location.lat,
        locationLng: SEYI.location.lng,
        trustScore: SEYI.trustScore,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Seyi is a verified worker: approved skill submission + verified user skill.
    await queryInterface.bulkInsert('SkillTasks', [
      {
        id: randomUUID(),
        workerId: seyiId,
        skillId: skillIdByCategory[SEYI.category],
        reviewerId: abuId,
        evidenceUrl: 'https://example.com/portfolio-sample.png',
        notes: 'Seeded demo submission.',
        status: 'approved',
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await queryInterface.bulkInsert('UserSkills', [
      {
        id: randomUUID(),
        userId: seyiId,
        skillId: skillIdByCategory[SEYI.category],
        proficiencyLevel: 3,
        verificationStatus: 'verified',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    const { Op } = require('sequelize');
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM "Users" WHERE email IN (:emails);`,
      { replacements: { emails: EMAILS } },
    );
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await queryInterface.bulkDelete('UserSkills', { userId: { [Op.in]: ids } });
      await queryInterface.bulkDelete('SkillTasks', { workerId: { [Op.in]: ids } });
    }
    await queryInterface.bulkDelete('Users', { email: { [Op.in]: EMAILS } });
  },
};
