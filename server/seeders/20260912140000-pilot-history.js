'use strict';
const { randomUUID } = require('crypto');

/**
 * Gives the demo a real operating history.
 *
 * The earlier seeders assert trust scores directly, which the scoring service
 * then overwrites with a provisional value because those workers have no
 * reviews. That left every score reading "new", the wallet and income statement
 * empty, the acceptance rate uncomputable, and the peer reviewer pool empty
 * because nobody could clear the trust floor. Trust has to be *earned* here:
 * completed jobs, confirmed payments and reviews, spread over time.
 *
 * Run `npm run trust:backfill` afterwards (npm run seed does this) to turn this
 * history into scores.
 */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);

// Worker key -> the jobs they have completed. Ratings are deliberately varied
// and dated so recency weighting and the volume prior both do visible work.
const HISTORY = {
  eric: {
    category: 'digital_web',
    jobs: [
      { client: 'grace', title: 'Landing page for a salon', amount: 85000, rating: 5, daysAgo: 12 },
      { client: 'robert', title: 'Fix a broken contact form', amount: 25000, rating: 5, daysAgo: 38 },
      { client: 'diane', title: 'Set up an online menu', amount: 60000, rating: 4, daysAgo: 74 },
      { client: 'samuel', title: 'Small business website', amount: 120000, rating: 5, daysAgo: 121 },
      { client: 'grace', title: 'Logo and social banners', amount: 40000, rating: 4, daysAgo: 168 },
    ],
  },
  aline: {
    category: 'tailoring',
    jobs: [
      { client: 'diane', title: 'Alter a wedding dress', amount: 55000, rating: 5, daysAgo: 9 },
      { client: 'grace', title: 'Hem twelve school uniforms', amount: 48000, rating: 5, daysAgo: 26 },
      { client: 'robert', title: 'Restaurant curtains', amount: 60000, rating: 4, daysAgo: 61 },
      { client: 'samuel', title: 'Repair two suit jackets', amount: 22000, rating: 5, daysAgo: 95 },
    ],
  },
  jeanbosco: {
    category: 'electronics_repair',
    jobs: [
      { client: 'robert', title: 'Replace a laptop screen', amount: 30000, rating: 4, daysAgo: 18 },
      { client: 'grace', title: 'Fix a phone charging port', amount: 10000, rating: 4, daysAgo: 44 },
      { client: 'diane', title: 'Repair a kitchen blender', amount: 12000, rating: 5, daysAgo: 88 },
    ],
  },
  claudine: {
    category: 'tutoring',
    jobs: [
      { client: 'samuel', title: 'S6 maths revision block', amount: 40000, rating: 5, daysAgo: 15 },
      { client: 'diane', title: 'Primary English tutoring', amount: 35000, rating: 5, daysAgo: 52 },
      { client: 'grace', title: 'Holiday reading support', amount: 28000, rating: 4, daysAgo: 110 },
    ],
  },
  // Deliberately thinner and weaker: a marketplace where everyone is excellent
  // teaches the matching engine nothing, and RQ2 needs candidates to rank.
  patrick: {
    category: 'digital_web',
    jobs: [
      { client: 'grace', title: 'Fix a slow website', amount: 30000, rating: 3, daysAgo: 33 },
      { client: 'robert', title: 'Update product photos', amount: 18000, rating: 4, daysAgo: 97 },
    ],
  },
};

// A decline and an abandonment, so acceptance rate is a real fraction and the
// completion component of the trust score is not uniformly perfect.
const DECLINES = [
  { worker: 'david', client: 'grace', title: 'Urgent laptop diagnostics', amount: 20000, daysAgo: 6, reason: 'Already booked that week' },
];
const ABANDONMENTS = [
  { worker: 'patrick', client: 'samuel', title: 'Rebuild an old shopfront site', amount: 45000, daysAgo: 21 },
];

module.exports = {
  async up(queryInterface) {
    const [skills] = await queryInterface.sequelize.query('SELECT id, category FROM "Skills";');
    const skillIdByCategory = Object.fromEntries(skills.map((s) => [s.category, s.id]));

    const [users] = await queryInterface.sequelize.query(
      `SELECT id, email, role FROM "Users" WHERE email LIKE '%@isoko.demo';`,
    );
    const idByKey = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));

    const gigs = [];
    const matches = [];
    const transactions = [];
    const reviews = [];

    const addJob = ({ workerKey, clientKey, category, title, amount, daysAgo, status, rating, origin, declineReason }) => {
      const workerId = idByKey[workerKey];
      const clientId = idByKey[clientKey];
      if (!workerId || !clientId) return;

      const openedAt = ago(daysAgo + 2);
      const respondedAt = ago(daysAgo + 1);
      const finishedAt = ago(daysAgo);
      const gigId = randomUUID();
      const matchId = randomUUID();

      gigs.push({
        id: gigId,
        clientId,
        skillId: skillIdByCategory[category],
        title,
        description: `${title}. Seeded pilot history.`,
        budget: amount,
        locationLat: -1.95 + (Math.random() - 0.5) * 0.06,
        locationLng: 30.08 + (Math.random() - 0.5) * 0.08,
        status: status === 'completed' ? 'completed' : 'open',
        openedAt,
        createdAt: openedAt,
        updatedAt: finishedAt,
      });

      matches.push({
        id: matchId,
        gigId,
        workerId,
        status,
        origin,
        respondedAt,
        acceptedAt: status === 'cancelled' && declineReason ? null : respondedAt,
        declineReason: declineReason ?? null,
        rankScore: null,
        createdAt: ago(daysAgo + 2),
        updatedAt: finishedAt,
      });

      if (status === 'completed') {
        const providerReference = `MOMO-SIM-${randomUUID()}`;
        transactions.push({
          id: randomUUID(),
          matchId,
          amount,
          currency: 'RWF',
          status: 'confirmed',
          // Paid on completion: in escrow terms, already released.
          escrowStatus: 'released',
          releasedAt: finishedAt,
          provider: 'simulated-momo',
          reference: providerReference,
          providerReference,
          providerStatus: 'SUCCESSFUL',
          createdAt: finishedAt,
          updatedAt: finishedAt,
        });
        // Both directions, as the platform requires after completion.
        reviews.push({
          id: randomUUID(),
          matchId,
          authorId: clientId,
          recipientId: workerId,
          rating,
          comment: null,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        });
        reviews.push({
          id: randomUUID(),
          matchId,
          authorId: workerId,
          recipientId: clientId,
          rating: Math.min(5, rating + 1),
          comment: null,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        });
      }
    };

    for (const [workerKey, { category, jobs }] of Object.entries(HISTORY)) {
      jobs.forEach((job, index) =>
        addJob({
          workerKey,
          clientKey: job.client,
          category,
          title: job.title,
          amount: job.amount,
          daysAgo: job.daysAgo,
          status: 'completed',
          rating: job.rating,
          // Alternating provenance so the pilot metrics have both arms to
          // compare from the first day rather than only after live use.
          origin: index % 2 === 0 ? 'manual' : 'ranked',
        }),
      );
    }

    for (const d of DECLINES) {
      addJob({
        workerKey: d.worker, clientKey: d.client, category: 'electronics_repair',
        title: d.title, amount: d.amount, daysAgo: d.daysAgo,
        status: 'cancelled', origin: 'ranked', declineReason: d.reason,
      });
    }
    for (const a of ABANDONMENTS) {
      addJob({
        workerKey: a.worker, clientKey: a.client, category: 'digital_web',
        title: a.title, amount: a.amount, daysAgo: a.daysAgo,
        status: 'cancelled', origin: 'manual',
      });
    }

    if (gigs.length === 0) return;

    await queryInterface.bulkInsert('Gigs', gigs);
    await queryInterface.bulkInsert('Matches', matches);
    if (transactions.length) await queryInterface.bulkInsert('Transactions', transactions);
    if (reviews.length) await queryInterface.bulkInsert('Reviews', reviews);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "Gigs" WHERE "description" LIKE '%Seeded pilot history.';`,
    );
  },
};
