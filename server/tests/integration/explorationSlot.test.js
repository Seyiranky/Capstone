const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const db = require('../../models');

// Three slots so there is room for two earned places and one reserved.
process.env.RANKED_INVITE_LIMIT = '3';
process.env.EXPLORATION_SLOTS = '1';

const stamp = Date.now();
const password = 'password123';
const emails = {
  client: `exp-client-${stamp}@example.com`,
  admin: `exp-admin-${stamp}@example.com`,
  established1: `exp-est1-${stamp}@example.com`,
  established2: `exp-est2-${stamp}@example.com`,
  established3: `exp-est3-${stamp}@example.com`,
  newcomer: `exp-new-${stamp}@example.com`,
};

const GIG_LAT = -1.9536;
const GIG_LNG = 30.1044;
const kmNorth = (km) => GIG_LAT + km / 111.32;

let skill;
let users = {};
let tokens = {};

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

const postGig = async (title) => {
  const res = await request(app)
    .post('/api/gigs')
    .set('Authorization', `Bearer ${tokens.client}`)
    .send({
      skillId: skill.id,
      title,
      description: 'Alterations needed this week.',
      budget: 30000,
      locationLat: GIG_LAT,
      locationLng: GIG_LNG,
    });
  return res.body.id;
};

const approve = async (gigId) => {
  const res = await request(app)
    .put(`/api/admin/gigs/${gigId}/review`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ decision: 'approved' });
  return res.body.invitations;
};

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } });
  const passwordHash = await bcrypt.hash(password, 10);

  users.client = await db.User.create({
    name: 'Exp Client', email: emails.client, passwordHash, role: 'client',
  });
  users.admin = await db.User.create({
    name: 'Exp Admin', email: emails.admin, passwordHash, role: 'admin',
  });

  // Three workers who would take every slot on merit: close, well reviewed,
  // and verified in the skill.
  for (const [i, key] of ['established1', 'established2', 'established3'].entries()) {
    users[key] = await db.User.create({
      name: `Exp Established ${i + 1}`,
      email: emails[key],
      passwordHash,
      role: 'worker',
      locationLat: kmNorth(0.4 + i * 0.1),
      locationLng: GIG_LNG,
      trustScore: 4.6 - i * 0.1,
      reviewCount: 8,
    });
    await db.UserSkill.create({
      userId: users[key].id,
      skillId: skill.id,
      verificationStatus: 'verified',
      proficiencyLevel: 5,
      provenance: 'work_earned',
      credentialStrength: 1,
    });
  }

  // Nobody has reviewed them and they have only declared the skill: on merit
  // alone they would never be reached.
  users.newcomer = await db.User.create({
    name: 'Exp Newcomer',
    email: emails.newcomer,
    passwordHash,
    role: 'worker',
    locationLat: kmNorth(3),
    locationLng: GIG_LNG,
    trustScore: 2.5,
    reviewCount: 0,
  });
  await db.UserSkill.create({
    userId: users.newcomer.id,
    skillId: skill.id,
    verificationStatus: 'unverified',
    proficiencyLevel: 1,
    provenance: 'self_declared',
    credentialStrength: 0.15,
  });

  for (const key of Object.keys(emails)) {
    tokens[key] = await login(emails[key]);
  }
});

afterAll(async () => {
  // Restored rather than deleted: deleting reinstates the default, which is not
  // what a later suite necessarily assumed.
  process.env.EXPLORATION_SLOTS = '0';
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('a reserved slot reaches workers ranking cannot', () => {
  let invitations;

  test('the newcomer would not make the shortlist on score alone', async () => {
    const gigId = await postGig(`Exploration baseline ${stamp}`);
    const res = await request(app)
      .get(`/api/gigs/${gigId}/candidates`)
      .set('Authorization', `Bearer ${tokens.client}`);

    const ranked = res.body.candidates.filter((c) => c.eligibleForInvite).map((c) => c.workerId);
    const position = ranked.indexOf(users.newcomer.id);
    expect(position).toBeGreaterThanOrEqual(3);
  });

  test('but they are invited anyway, in the reserved slot', async () => {
    invitations = await approve(await postGig(`Exploration reserved ${stamp}`));

    const mine = invitations.filter((i) =>
      Object.values(users).some((u) => u.id === i.workerId),
    );
    const explorer = mine.find((i) => i.workerId === users.newcomer.id);

    expect(explorer).toBeTruthy();
    expect(explorer.invitationReason).toBe('exploration');
  });

  test('the reserved slot is the last one and displaces nobody', () => {
    // Everything before the explorer was earned on rank.
    const explorerIndex = invitations.findIndex((i) => i.invitationReason === 'exploration');
    expect(explorerIndex).toBe(invitations.length - 1);
    expect(invitations.slice(0, explorerIndex).every((i) => i.invitationReason === 'ranked')).toBe(
      true,
    );
  });

  test('earned invitations still went to the strongest candidates', () => {
    const earned = invitations.filter((i) => i.invitationReason === 'ranked');
    const explorer = invitations.find((i) => i.invitationReason === 'exploration');
    for (const e of earned) {
      expect(e.rankScore).toBeGreaterThan(explorer.rankScore);
    }
  });

  test('turning exploration off returns the slot to the ranking', async () => {
    process.env.EXPLORATION_SLOTS = '0';
    const pure = await approve(await postGig(`Exploration disabled ${stamp}`));

    expect(pure.every((i) => i.invitationReason === 'ranked')).toBe(true);
    expect(pure.map((i) => i.workerId)).not.toContain(users.newcomer.id);
    process.env.EXPLORATION_SLOTS = '1';
  });
});

describe('the metrics keep the two kinds of invitation apart', () => {
  test('acceptance is reported separately for earned and reserved invitations', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    const byReason = res.body.matchAcceptance.byInvitationReason;
    // Pooling these would let reserved-slot invitations flatter or depress the
    // ranked arm's acceptance rate, which is RQ2's headline number.
    expect(byReason.ranked).toBeTruthy();
    expect(byReason.exploration).toBeTruthy();
    expect(byReason.exploration.total).toBeGreaterThan(0);
  });

  test('newcomer access is reported so a starved pilot is visible early', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${tokens.admin}`);

    const access = res.body.newcomerAccess;
    expect(access.newcomers).toBeGreaterThan(0);
    expect(access.invitations.toNewcomers).toBeGreaterThan(0);
    expect(access.invitations.byReason.exploration).toBeGreaterThan(0);
    expect(access.threshold.reviewsBelow).toBeGreaterThan(0);
    expect(typeof access.newcomersNeverInvited).toBe('number');
  });
});
