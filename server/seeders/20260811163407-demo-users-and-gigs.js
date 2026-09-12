'use strict';
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

const DEMO_DOMAIN = '@isoko.demo';
const DEMO_PASSWORD = 'password123';

const ADMINS = [
  { name: 'Emmanuel Nkurunziza', email: `emmanuel${DEMO_DOMAIN}` },
  { name: 'Solange Ingabire', email: `solange${DEMO_DOMAIN}` },
];

const WORKERS = [
  {
    name: 'Eric Niyonzima',
    email: `eric${DEMO_DOMAIN}`,
    category: 'digital_web',
    location: { lat: -1.9441, lng: 30.0619 },
    trustScore: 4.7,
    verified: true,
    reviewer: 'emmanuel',
  },
  {
    name: 'Patrick Habimana',
    email: `patrick${DEMO_DOMAIN}`,
    category: 'digital_web',
    location: { lat: -1.9558, lng: 30.1044 },
    trustScore: 3.9,
    verified: true,
    reviewer: 'emmanuel',
  },
  {
    name: 'Aline Uwase',
    email: `aline${DEMO_DOMAIN}`,
    category: 'tailoring',
    location: { lat: -1.9706, lng: 30.0394 },
    trustScore: 5.0,
    verified: true,
    reviewer: 'solange',
  },
  {
    name: 'Jean Bosco Mugisha',
    email: `jeanbosco${DEMO_DOMAIN}`,
    category: 'electronics_repair',
    location: { lat: -1.935, lng: 30.04 },
    trustScore: 4.2,
    verified: true,
    reviewer: 'emmanuel',
  },
  {
    name: 'Claudine Mukamana',
    email: `claudine${DEMO_DOMAIN}`,
    category: 'tutoring',
    location: { lat: -1.935, lng: 30.0889 },
    trustScore: 4.8,
    verified: true,
    reviewer: 'solange',
  },
  {
    name: 'David Ntwari',
    email: `david${DEMO_DOMAIN}`,
    category: 'electronics_repair',
    location: { lat: -1.9833, lng: 30.0667 },
    trustScore: 0,
    verified: false,
    reviewer: 'emmanuel',
  },
];

const CLIENTS = [
  { name: 'Grace Uwimana', email: `grace${DEMO_DOMAIN}` },
  { name: 'Robert Nshimiyimana', email: `robert${DEMO_DOMAIN}` },
  { name: 'Diane Umutesi', email: `diane${DEMO_DOMAIN}` },
  { name: 'Samuel Byiringiro', email: `samuel${DEMO_DOMAIN}` },
];

const GIGS = [
  {
    client: 'grace',
    category: 'digital_web',
    title: 'Build an online store for my boutique',
    description: 'Need a simple e-commerce site to showcase and sell clothing online.',
    budget: 80000,
    location: { lat: -1.9441, lng: 30.0619 },
  },
  {
    client: 'grace',
    category: 'digital_web',
    title: 'Design a logo and business cards',
    description: 'Looking for a clean, modern logo and print-ready business card design.',
    budget: 25000,
    location: { lat: -1.9441, lng: 30.0619 },
  },
  {
    client: 'robert',
    category: 'electronics_repair',
    title: 'Repair my laptop screen',
    description: 'Laptop screen is cracked and flickering, needs replacement or repair.',
    budget: 30000,
    location: { lat: -1.935, lng: 30.04 },
  },
  {
    client: 'robert',
    category: 'electronics_repair',
    title: 'Fix a broken phone charging port',
    description: 'Phone no longer charges reliably, likely a loose or damaged port.',
    budget: 10000,
    location: { lat: -1.9833, lng: 30.0667 },
  },
  {
    client: 'diane',
    category: 'tailoring',
    title: 'Tailor 20 school uniforms',
    description: 'Need 20 matching school uniforms sewn from provided fabric, sized for children.',
    budget: 150000,
    location: { lat: -1.9706, lng: 30.0394 },
  },
  {
    client: 'diane',
    category: 'tailoring',
    title: 'Make custom curtains for a restaurant',
    description: 'Restaurant needs custom-measured curtains for eight large windows.',
    budget: 60000,
    location: { lat: -1.9889, lng: 30.1 },
  },
  {
    client: 'samuel',
    category: 'tutoring',
    title: 'Math and Physics tutoring for S6 exams',
    description: 'Weekly tutoring sessions to prepare for national exams, ideally twice a week.',
    budget: 40000,
    location: { lat: -1.935, lng: 30.0889 },
  },
  {
    client: 'samuel',
    category: 'tutoring',
    title: 'English tutoring for my daughter',
    description: 'Primary school student needs help with reading and English composition.',
    budget: 35000,
    location: { lat: -1.9558, lng: 30.1044 },
  },
  {
    client: 'diane',
    category: 'tutoring',
    title: 'Weekend French lessons for two kids',
    description: 'Looking for a patient tutor to teach basic conversational French on weekends.',
    budget: 45000,
    location: { lat: -1.9706, lng: 30.0394 },
    status: 'pending_review',
  },
];

// Workers who apply (pending) to the seeded "Repair my laptop screen" gig, so
// the demo admin has real applications to review on the gig detail page.
const APPLICANTS = ['jeanbosco', 'david'];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const [skillRows] = await queryInterface.sequelize.query('SELECT id, category FROM "Skills";');
    const skillIdByCategory = Object.fromEntries(skillRows.map((s) => [s.category, s.id]));

    const adminRecords = ADMINS.map((a) => ({ ...a, id: randomUUID() }));
    const adminIdByKey = Object.fromEntries(adminRecords.map((a) => [a.email.split('@')[0], a.id]));

    const workerRecords = WORKERS.map((w) => ({ ...w, id: randomUUID() }));
    const workerIdByKey = Object.fromEntries(workerRecords.map((w) => [w.email.split('@')[0], w.id]));
    const clientRecords = CLIENTS.map((c) => ({ ...c, id: randomUUID() }));
    const clientIdByKey = Object.fromEntries(
      clientRecords.map((c) => [c.email.split('@')[0], c.id]),
    );

    await queryInterface.bulkInsert('Users', [
      ...adminRecords.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        passwordHash,
        role: 'admin',
        trustScore: 0,
        createdAt: now,
        updatedAt: now,
      })),
      ...workerRecords.map((w) => ({
        id: w.id,
        name: w.name,
        email: w.email,
        passwordHash,
        role: 'worker',
        locationLat: w.location.lat,
        locationLng: w.location.lng,
        trustScore: w.trustScore,
        createdAt: now,
        updatedAt: now,
      })),
      ...clientRecords.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        passwordHash,
        role: 'client',
        trustScore: 0,
        createdAt: now,
        updatedAt: now,
      })),
    ]);

    await queryInterface.bulkInsert(
      'SkillTasks',
      workerRecords.map((w) => ({
        id: randomUUID(),
        workerId: w.id,
        skillId: skillIdByCategory[w.category],
        reviewerId: adminIdByKey[w.reviewer],
        evidenceUrl: 'https://example.com/portfolio-sample.png',
        notes: 'Seeded demo submission.',
        status: w.verified ? 'approved' : 'pending',
        reviewedAt: w.verified ? now : null,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await queryInterface.bulkInsert(
      'UserSkills',
      workerRecords
        .filter((w) => w.verified)
        .map((w) => ({
          id: randomUUID(),
          userId: w.id,
          skillId: skillIdByCategory[w.category],
          proficiencyLevel: 3,
          verificationStatus: 'verified',
          createdAt: now,
          updatedAt: now,
        })),
    );

    const gigRecords = GIGS.map((g) => ({ ...g, id: randomUUID() }));
    await queryInterface.bulkInsert(
      'Gigs',
      gigRecords.map((g) => ({
        id: g.id,
        clientId: clientIdByKey[g.client],
        skillId: skillIdByCategory[g.category],
        title: g.title,
        description: g.description,
        budget: g.budget,
        locationLat: g.location.lat,
        locationLng: g.location.lng,
        status: g.status || 'open',
        createdAt: now,
        updatedAt: now,
      })),
    );

    const laptopRepairGig = gigRecords.find((g) => g.title === 'Repair my laptop screen');
    await queryInterface.bulkInsert(
      'GigApplications',
      APPLICANTS.map((key) => ({
        id: randomUUID(),
        gigId: laptopRepairGig.id,
        workerId: workerIdByKey[key],
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })),
    );
  },

  async down(queryInterface) {
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('Users', { email: { [Op.like]: `%${DEMO_DOMAIN}` } });
  },
};
