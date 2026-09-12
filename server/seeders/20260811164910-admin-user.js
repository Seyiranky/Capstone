'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const ADMIN_EMAIL = 'admin@isoko.demo';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash('password123', 10);

    await queryInterface.bulkInsert('Users', [
      {
        id: randomUUID(),
        name: 'Isoko Admin',
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
        trustScore: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Users', { email: ADMIN_EMAIL });
  },
};
