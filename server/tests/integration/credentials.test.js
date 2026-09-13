const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const db = require('../../models');

// Rotation is what this suite is checking, so the pool must be big enough for
// a placement to be a real choice rather than the only option.
// Stated rather than inherited: process.env is shared across suites, so a
// value left behind by another file would silently change what is invited here.
process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails = {
  worker: `cred-worker-${stamp}@example.com`,
  client: `cred-client-${stamp}@example.com`,
  admin1: `cred-admin1-${stamp}@example.com`,
  admin2: `cred-admin2-${stamp}@example.com`,
  admin3: `cred-admin3-${stamp}@example.com`,
  admin4: `cred-admin4-${stamp}@example.com`,
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let skill;
let users = {};
let tokens = {};

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

/** A token for whoever holds the open assignment, whoever that turns out to be. */
const tokenForUserId = async (userId) => {
  if (!userId) throw new Error('no open assignment: the eligible reviewer pool was exhausted');
  const key = Object.keys(users).find((k) => users[k].id === userId);
  if (key) return tokens[key];
  const user = await db.User.findByPk(userId);
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const openAssignee = async (taskId) => {
  const assignment = await db.SkillTaskAssignment.findOne({
    where: { taskId, status: 'pending' },
  });
  return assignment?.reviewerId ?? null;
};

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'electronics_repair', parentId: null } });
  const passwordHash = await bcrypt.hash(password, 10);

  users.worker = await db.User.create({
    name: 'Cred Worker', email: emails.worker, passwordHash, role: 'worker',
  });
  users.client = await db.User.create({
    name: 'Cred Client', email: emails.client, passwordHash, role: 'client',
  });
  for (const key of ['admin1', 'admin2', 'admin3', 'admin4']) {
    users[key] = await db.User.create({
      name: `Cred ${key}`, email: emails[key], passwordHash, role: 'admin',
    });
  }

  for (const key of Object.keys(emails)) {
    tokens[key] = await login(emails[key]);
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('self-declaration', () => {
  test('a worker can record a skill nobody has checked yet', async () => {
    const res = await request(app)
      .post('/api/skill-tasks/declare')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ skillId: skill.id, proficiencyLevel: 4 });

    expect(res.status).toBe(201);
    expect(res.body.verificationStatus).toBe('unverified');
    expect(res.body.provenance).toBe('self_declared');
    expect(res.body.selfDeclaredAt).toBeTruthy();
  });

  test('declaring again does not create a duplicate', async () => {
    const res = await request(app)
      .post('/api/skill-tasks/declare')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ skillId: skill.id, proficiencyLevel: 3 });

    expect(res.status).toBe(200);
    const rows = await db.UserSkill.findAll({
      where: { userId: users.worker.id, skillId: skill.id },
    });
    expect(rows).toHaveLength(1);
  });

  test('a client cannot declare skills', async () => {
    const res = await request(app)
      .post('/api/skill-tasks/declare')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({ skillId: skill.id });
    expect(res.status).toBe(403);
  });
});

describe('a certificate goes through the same rotation as a skill', () => {
  let taskId;
  let reviewerId;

  test('submitting a certificate requires a claim about what it is', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .field('kind', 'certificate')
      .attach('evidence', PNG, { filename: 'cert.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title and an issuer/i);
  });

  test('a photographed paper certificate is accepted', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .field('kind', 'certificate')
      .field('title', 'TVET Level 3 Electronics')
      .field('issuer', 'Workforce Development Authority')
      .field('evidenceKind', 'document')
      .attach('evidence', PNG, { filename: 'cert.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('certificate');
    expect(res.body.claim.title).toBe('TVET Level 3 Electronics');
    taskId = res.body.id;

    // The client said this JPEG is a document, and the server took its word
    // over sniffing — a photo of a certificate and a photo of work are
    // indistinguishable by mime type.
    const evidence = await db.SkillTaskEvidence.findAll({ where: { taskId } });
    expect(evidence[0].kind).toBe('document');
  });

  test('it was assigned by the same collusion-resistant machinery', async () => {
    reviewerId = await openAssignee(taskId);
    expect(reviewerId).toBeTruthy();
    // Never the worker themselves.
    expect(reviewerId).not.toBe(users.worker.id);

    const assignment = await db.SkillTaskAssignment.findOne({
      where: { taskId, reviewerId },
    });
    // The seed and pool size are what make a placement auditable rather than
    // merely asserted; a bespoke certificate path would have neither.
    expect(assignment.assignmentSeed).toBeTruthy();
    expect(assignment.eligiblePoolSize).toBeGreaterThan(0);
    expect(assignment.round).toBe(1);
  });

  test('sighting it raises provenance to document sighted, not to verified-genuine', async () => {
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(reviewerId)}`)
      .send({ decision: 'approved', confidence: 4, proficiencyLevel: 3 });
    expect(res.status).toBe(200);

    // A first verification needs a second approval, so settle the quorum.
    if (res.body.status === 'pending') {
      const second = await openAssignee(taskId);
      expect(second).not.toBe(reviewerId);
      await request(app)
        .put(`/api/skill-tasks/${taskId}/review`)
        .set('Authorization', `Bearer ${await tokenForUserId(second)}`)
        .send({ decision: 'approved', confidence: 4, proficiencyLevel: 3 });
    }

    const userSkill = await db.UserSkill.findOne({
      where: { userId: users.worker.id, skillId: skill.id },
    });
    expect(userSkill.provenance).toBe('document_sighted');
    expect(userSkill.credentialStrength).toBe(0.5);
    expect(userSkill.provenanceDetail.sightedCertificates).toBe(1);
  });

  test('a demonstration then outranks the document', async () => {
    const submit = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${tokens.worker}`)
      .field('skillId', skill.id)
      .attach('evidence', PNG, { filename: 'work.png', contentType: 'image/png' });
    expect(submit.status).toBe(201);
    expect(submit.body.kind).toBe('demonstration');

    let assignee = await openAssignee(submit.body.id);
    let res = await request(app)
      .put(`/api/skill-tasks/${submit.body.id}/review`)
      .set('Authorization', `Bearer ${await tokenForUserId(assignee)}`)
      .send({ decision: 'approved', confidence: 5, proficiencyLevel: 4 });

    if (res.body.status === 'pending') {
      assignee = await openAssignee(submit.body.id);
      res = await request(app)
        .put(`/api/skill-tasks/${submit.body.id}/review`)
        .set('Authorization', `Bearer ${await tokenForUserId(assignee)}`)
        .send({ decision: 'approved', confidence: 5, proficiencyLevel: 4 });
    }

    const userSkill = await db.UserSkill.findOne({
      where: { userId: users.worker.id, skillId: skill.id },
    });
    expect(userSkill.provenance).toBe('peer_reviewed');
    expect(userSkill.credentialStrength).toBe(0.8);
  });
});

describe('credentials reach the ranking', () => {
  test('provenance is a scored component and an explanation, not decoration', async () => {
    const gig = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({
        skillId: skill.id,
        title: `Credential gig ${stamp}`,
        description: 'Repair a set of handsets.',
        budget: 25000,
        locationLat: -1.9536,
        locationLng: 30.1044,
      });

    const res = await request(app)
      .get(`/api/gigs/${gig.body.id}/candidates`)
      .set('Authorization', `Bearer ${tokens.client}`);

    const ours = res.body.candidates.find((c) => c.workerId === users.worker.id);
    const credentials = ours.components.find((c) => c.key === 'credentials');
    expect(credentials.value).toBe(0.8);
    expect(ours.reasons.map((r) => r.key)).toContain('match.reason.provenance.peer_reviewed');

    // The client can see how much this component could move a ranking at all.
    expect(res.body.componentVariance.credentials).toBeTruthy();
  });

  test('credential_first re-ranks the same candidates', async () => {
    const gig = await db.Gig.findOne({
      where: { clientId: users.client.id },
      order: [['createdAt', 'DESC']],
    });
    const res = await request(app)
      .get(`/api/gigs/${gig.id}/candidates?profile=credential_first`)
      .set('Authorization', `Bearer ${tokens.client}`);

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].weightProfile.name).toBe('credential_first');
    expect(res.body.candidates[0].components.map((c) => c.key)).toContain('credentials');
  });
});
