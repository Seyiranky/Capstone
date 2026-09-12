const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const db = require('../../models');

const stamp = Date.now();
const password = 'password123';
const emails = {
  worker: `pp-worker-${stamp}@example.com`,
  client: `pp-client-${stamp}@example.com`,
  admin: `pp-admin-${stamp}@example.com`,
};

let skill;
let otherSkill;
let users = {};
let tokens = {};
let passportToken;

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

/** A completed, paid, reviewed job for the worker. */
const completedJob = async ({ amount, title }) => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title,
    description: 'Fixture',
    budget: amount,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'completed',
  });
  const match = await db.Match.create({
    gigId: gig.id,
    workerId: users.worker.id,
    status: 'completed',
    acceptedAt: new Date(),
    respondedAt: new Date(),
  });
  await db.Transaction.create({
    matchId: match.id,
    amount,
    status: 'confirmed',
    provider: 'simulated-momo',
    reference: `MOMO-SIM-${Math.random().toString(36).slice(2)}`,
  });
  return match;
};

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'tailoring' } });
  otherSkill = await db.Skill.findOne({ where: { category: 'tutoring' } });
  const passwordHash = await bcrypt.hash(password, 10);

  users.worker = await db.User.create({
    name: 'Passport Worker', email: emails.worker, passwordHash, role: 'worker',
  });
  users.client = await db.User.create({
    name: 'Passport Client', email: emails.client, passwordHash, role: 'client',
  });
  users.admin = await db.User.create({
    name: 'Passport Admin', email: emails.admin, passwordHash, role: 'admin',
  });

  await db.UserSkill.create({
    userId: users.worker.id, skillId: skill.id,
    verificationStatus: 'verified', proficiencyLevel: 4,
  });
  await db.SkillTask.create({
    workerId: users.worker.id, skillId: skill.id,
    evidenceUrl: '/uploads/evidence/x.jpg', status: 'approved',
  });

  await completedJob({ amount: 20000, title: 'Passport job one' });
  await completedJob({ amount: 30000, title: 'Passport job two' });

  for (const key of Object.keys(emails)) {
    tokens[key] = await login(emails[key]);
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('issuing a skill passport', () => {
  test('a worker can issue one', async () => {
    const res = await request(app)
      .post('/api/passports')
      .set('Authorization', `Bearer ${tokens.worker}`);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.claims.skills).toHaveLength(1);
    expect(res.body.claims.skills[0].proficiencyLevel).toBe(4);
    passportToken = res.body.token;
  });

  test('a client cannot issue a passport for themselves', async () => {
    const res = await request(app)
      .post('/api/passports')
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(403);
  });
});

describe('reading a passport without an account', () => {
  test('anyone holding the link can read it, with no token', async () => {
    const res = await request(app).get(`/api/passports/${passportToken}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.claims.name).toBe('Passport Worker');
    expect(res.body.claims.completedJobs).toBe(2);
  });

  test('it reports how many people verified a skill, never who they were', async () => {
    const res = await request(app).get(`/api/passports/${passportToken}`);
    const entry = res.body.claims.skills[0];

    expect(entry.independentApprovals).toBeGreaterThan(0);
    // Naming reviewers would expose them to the pressure rotation exists to prevent.
    expect(JSON.stringify(res.body)).not.toContain('reviewerId');
    expect(JSON.stringify(res.body)).not.toContain('Passport Admin');
  });

  test('a tampered token is rejected rather than trusted', async () => {
    const res = await request(app).get(`/api/passports/${passportToken.slice(0, -4)}aaaa`);
    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('invalidSignature');
  });
});

describe('tamper evidence', () => {
  test('an untouched record verifies as an exact match', async () => {
    const res = await request(app).get(`/api/passports/${passportToken}/verify`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.matches).toBe(true);
  });

  test('a changed record is detected, and reported as changed rather than forged', async () => {
    // The holder gains a second verified skill after the passport was issued.
    await db.UserSkill.create({
      userId: users.worker.id, skillId: otherSkill.id,
      verificationStatus: 'verified', proficiencyLevel: 2,
    });

    const res = await request(app).get(`/api/passports/${passportToken}/verify`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.matches).toBe(false);
    expect(res.body.current.skills).toHaveLength(2);
    expect(res.body.note).toMatch(/changed since the passport was issued/i);
  });
});

describe('revocation', () => {
  test('issuing again revokes the previous passport', async () => {
    const reissued = await request(app)
      .post('/api/passports')
      .set('Authorization', `Bearer ${tokens.worker}`);
    expect(reissued.status).toBe(201);

    const old = await request(app).get(`/api/passports/${passportToken}`);
    expect(old.status).toBe(404);
    expect(old.body.reason).toBe('revoked');

    const fresh = await request(app).get(`/api/passports/${reissued.body.token}`);
    expect(fresh.status).toBe(200);
    passportToken = reissued.body.token;
  });

  test('a worker can revoke their passport outright', async () => {
    const res = await request(app)
      .delete('/api/passports')
      .set('Authorization', `Bearer ${tokens.worker}`);
    expect(res.status).toBe(200);

    const after = await request(app).get(`/api/passports/${passportToken}`);
    expect(after.status).toBe(404);
    expect(after.body.reason).toBe('revoked');
  });
});

describe('income statement', () => {
  let signature;

  test('it totals only confirmed payments, with a per-month breakdown', async () => {
    const res = await request(app)
      .get('/api/users/me/income-statement')
      .set('Authorization', `Bearer ${tokens.worker}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.jobsPaid).toBe(2);
    expect(res.body.summary.totalEarned).toBe(50000);
    expect(res.body.summary.averagePerJob).toBe(25000);
    expect(res.body.byMonth.length).toBeGreaterThan(0);
    expect(res.body.byCategory[0].category).toBe('tailoring');
    expect(res.body.currency).toBe('RWF');
    signature = res.body.signature;
  });

  test('an unconfirmed payment is not counted as income', async () => {
    const match = await completedJob({ amount: 99000, title: 'Unpaid job' });
    await db.Transaction.update({ status: 'initiated' }, { where: { matchId: match.id } });

    const res = await request(app)
      .get('/api/users/me/income-statement')
      .set('Authorization', `Bearer ${tokens.worker}`);

    expect(res.body.summary.jobsPaid).toBe(2);
    expect(res.body.summary.totalEarned).toBe(50000);
  });

  test('a lender can verify the figures came from the platform unaltered', async () => {
    const res = await request(app)
      .post('/api/users/income-statement/verify')
      .send({ signature });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.matches).toBe(true);
    expect(res.body.statedTotal).toBe(50000);
  });

  test('an edited signature does not verify', async () => {
    const res = await request(app)
      .post('/api/users/income-statement/verify')
      .send({ signature: `${signature.slice(0, -4)}aaaa` });

    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('invalidSignature');
  });

  test('it exports as CSV for a lender who wants a file', async () => {
    const res = await request(app)
      .get('/api/users/me/income-statement?format=csv')
      .set('Authorization', `Bearer ${tokens.worker}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toBe('date,gig,category,amount,currency,provider,reference');
    expect(res.text.split('\n')).toHaveLength(3);
  });
});
