'use strict';

const crypto = require('crypto');

// Every profile is rewritten together. scorePair builds components from the
// weight keys, so a profile left on four keys would silently contribute no
// credentials signal while its neighbours did — and the comparison between
// profiles, which is the whole of RQ2, would be measuring the mismatch.
const PROFILES = {
  balanced: { distance: 0.25, trust: 0.25, skillFit: 0.2, credentials: 0.2, availability: 0.1 },
  proximity_first: { distance: 0.45, trust: 0.15, skillFit: 0.2, credentials: 0.15, availability: 0.05 },
  trust_first: { distance: 0.15, trust: 0.45, skillFit: 0.15, credentials: 0.2, availability: 0.05 },
  // A fourth arm, so RQ2 can ask what happens when how-well-established a claim
  // is outweighs both proximity and reputation.
  credential_first: { distance: 0.15, trust: 0.15, skillFit: 0.2, credentials: 0.45, availability: 0.05 },
};

module.exports = {
  async up(queryInterface) {
    for (const [name, weights] of Object.entries(PROFILES)) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM "MatchWeightProfiles" WHERE name = :name`,
        { replacements: { name }, type: queryInterface.sequelize.QueryTypes.SELECT },
      );

      if (existing) {
        await queryInterface.sequelize.query(
          `UPDATE "MatchWeightProfiles" SET "weights" = :weights, "updatedAt" = NOW() WHERE name = :name`,
          { replacements: { name, weights: JSON.stringify(weights) } },
        );
      } else {
        await queryInterface.bulkInsert('MatchWeightProfiles', [
          {
            id: crypto.randomUUID(),
            name,
            weights: JSON.stringify(weights),
            distanceHalfLifeKm: 3,
            maxDistanceKm: 15,
            isActive: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }
    }
  },

  async down(queryInterface) {
    const FOUR = {
      balanced: { distance: 0.3, trust: 0.3, skillFit: 0.3, availability: 0.1 },
      proximity_first: { distance: 0.5, trust: 0.2, skillFit: 0.25, availability: 0.05 },
      trust_first: { distance: 0.2, trust: 0.5, skillFit: 0.25, availability: 0.05 },
    };
    for (const [name, weights] of Object.entries(FOUR)) {
      await queryInterface.sequelize.query(
        `UPDATE "MatchWeightProfiles" SET "weights" = :weights WHERE name = :name`,
        { replacements: { name, weights: JSON.stringify(weights) } },
      );
    }
    await queryInterface.bulkDelete('MatchWeightProfiles', { name: 'credential_first' });
  },
};
