'use strict';

const crypto = require('crypto');

// Reference data, not demo data: the matching service resolves an active
// profile at runtime, and RQ2 compares ranking behaviour across these
// weightings. They live in the migration so dev, test and pilot databases all
// have them without depending on a seeder being run.
const PROFILES = [
  {
    name: 'balanced',
    weights: { distance: 0.3, trust: 0.3, skillFit: 0.3, availability: 0.1 },
    isActive: true,
  },
  {
    name: 'proximity_first',
    weights: { distance: 0.5, trust: 0.2, skillFit: 0.25, availability: 0.05 },
    isActive: false,
  },
  {
    name: 'trust_first',
    weights: { distance: 0.2, trust: 0.5, skillFit: 0.25, availability: 0.05 },
    isActive: false,
  },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('MatchWeightProfiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      weights: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      distanceHalfLifeKm: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 3,
      },
      maxDistanceKm: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 15,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    const now = new Date();
    await queryInterface.bulkInsert(
      'MatchWeightProfiles',
      PROFILES.map((profile) => ({
        id: crypto.randomUUID(),
        name: profile.name,
        weights: JSON.stringify(profile.weights),
        distanceHalfLifeKm: 3,
        maxDistanceKm: 15,
        isActive: profile.isActive,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('MatchWeightProfiles');
  },
};
