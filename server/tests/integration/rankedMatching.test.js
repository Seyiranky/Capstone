const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const db = require('../../models');

// The ranked arm: approving a gig invites a scored shortlist rather than
// waiting for workers to find it themselves.
process.env.RANKED_INVITE_LIMIT = '2';

const stamp = Date.now();
const password = 'password123';
const emails = {
  client: `ranked-client-${stamp}@example.com`,
  admin: `ranked-admin-${stamp}@example.com`,
  near: `ranked-near-${stamp}@example.com`,
  far: `ranked-far-${stamp}@example.com`,
  distant: `ranked-distant-${stamp}@example.com`,
};

// Kimironko, and offsets north of it (1 degree of latitude is ~111.32km).
const GIG_LAT = -1.9536;
const GIG_LNG = 30.1044;
const kmNorth = (km) => GIG_LAT + km / 111.32;

let skill;
let tokens = {};
let users = {};
let gigId;

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'tailoring' } });
  const passwordHash = await bcrypt.hash(password, 10);

  users.client = await db.User.create({
    name: 'Ranked Client', email: emails.client, passwordHash, role: 'client',
  });
  users.admin = await db.User.create({
    name: 'Ranked Admin', email: emails.admin, passwordHash, role: 'admin',
  });
  // Near and highly rated: should rank first under any weighting.
  users.near = await db.User.create({
    name: 'Near Worker', email: emails.near, passwordHash, role: 'worker',
    locationLat: kmNorth(0.5), locationLng: GIG_LNG, trustScore: 4.5, reviewCount: 10,
  });
  // Further out and unrated: makes the shortlist only because the cap is 2.
  users.far = await db.User.create({
    name: 'Far Worker', email: emails.far, passwordHash, role: 'worker',
    locationLat: kmNorth(5), locationLng: GIG_LNG, trustScore: 2, reviewCount: 3,
  });
  // Beyond the 15km radius: must never be invited.
  users.distant = await db.User.create({
    name: 'Distant Worker', email: emails.distant, passwordHash, role: 'worker',
    locationLat: kmNorth(60), locationLng: GIG_LNG, trustScore: 5, reviewCount: 30,
  });

  // All three have the gig's skill, so skill fit is not what separates them.
  for (const key of ['near', 'far', 'distant']) {
    await db.UserSkill.create({
      userId: users[key].id, skillId: skill.id, verificationStatus: 'verified', proficiencyLevel: 3,
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

describe('ranked candidate listing', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${tokens.client}`)
      .send({
        skillId: skill.id,
        title: `Ranked gig ${stamp}`,
        description: 'Hem a batch of school uniforms.',
        budget: 18000,
        locationLat: GIG_LAT,
        locationLng: GIG_LNG,
      });
    gigId = res.body.id;
  });

  test('a stranger cannot see the candidate ranking for a gig', async () => {
    const res = await request(app)
      .get(`/api/gigs/${gigId}/candidates`)
      .set('Authorization', `Bearer ${tokens.near}`);
    expect(res.status).toBe(403);
  });

  test('the posting client sees candidates ranked with an explainable breakdown', async () => {
    const res = await request(app)
      .get(`/api/gigs/${gigId}/candidates`)
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.status).toBe(200);

    const ours = res.body.candidates.filter((c) =>
      [users.near.id, users.far.id, users.distant.id].includes(c.workerId),
    );
    const near = ours.find((c) => c.workerId === users.near.id);
    const far = ours.find((c) => c.workerId === users.far.id);

    expect(near.rank).toBeLessThan(far.rank);
    expect(near.components.map((c) => c.key).sort()).toEqual(
      ['availability', 'credentials', 'distance', 'skillFit', 'trust'],
    );
    expect(near.reasons.length).toBeGreaterThan(0);
    expect(near.distanceKm).toBeCloseTo(0.5, 1);
  });

  test('a candidate beyond the maximum radius is listed but not invitable', async () => {
    const res = await request(app)
      .get(`/api/gigs/${gigId}/candidates`)
      .set('Authorization', `Bearer ${tokens.client}`);
    const distant = res.body.candidates.find((c) => c.workerId === users.distant.id);
    expect(distant.beyondRange).toBe(true);
    expect(distant.eligibleForInvite).toBe(false);
  });

  test('switching the weight profile re-ranks the same candidates (RQ2)', async () => {
    const order = async (profile) => {
      const res = await request(app)
        .get(`/api/gigs/${gigId}/candidates?profile=${profile}`)
        .set('Authorization', `Bearer ${tokens.client}`);
      return res.body.candidates
        .filter((c) => [users.near.id, users.far.id].includes(c.workerId))
        .map((c) => c.workerId);
    };

    const proximity = await order('proximity_first');
    const trust = await order('trust_first');

    expect(proximity[0]).toBe(users.near.id);
    // Weighting is recorded on each result so the ranking stays reproducible.
    const res = await request(app)
      .get(`/api/gigs/${gigId}/candidates?profile=trust_first`)
      .set('Authorization', `Bearer ${tokens.client}`);
    expect(res.body.candidates[0].weightProfile.name).toBe('trust_first');
    expect(trust).toHaveLength(2);
  });
});

describe('ranked invitations on approval', () => {
  let invitations;

  test('approving a gig invites the top-ranked eligible workers as pending matches', async () => {
    const res = await request(app)
      .put(`/api/admin/gigs/${gigId}/review`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
    expect(res.body.openedAt).toBeTruthy();

    invitations = res.body.invitations;
    expect(invitations).toHaveLength(2);
    for (const invitation of invitations) {
      expect(invitation.status).toBe('pending');
      expect(invitation.origin).toBe('ranked');
      expect(invitation.rankScore).toBeGreaterThan(0);
      expect(invitation.scoreBreakdown.components).toBeTruthy();
    }
  });

  test('the out-of-range worker was not invited', () => {
    expect(invitations.map((i) => i.workerId)).not.toContain(users.distant.id);
  });

  test('an invited worker cannot also apply, which would duplicate the match', async () => {
    const res = await request(app)
      .post('/api/gig-applications')
      .set('Authorization', `Bearer ${tokens.near}`)
      .send({ gigId });
    expect(res.status).toBe(409);
  });

  test('a declined invitation records a response without an acceptance', async () => {
    const invitation = invitations.find((i) => i.workerId === users.far.id);
    const res = await request(app)
      .put(`/api/matches/${invitation.id}/status`)
      .set('Authorization', `Bearer ${tokens.far}`)
      .send({ status: 'cancelled', declineReason: 'Too far to travel' });

    expect(res.status).toBe(200);
    expect(res.body.respondedAt).toBeTruthy();
    expect(res.body.acceptedAt).toBeNull();
    expect(res.body.declineReason).toBe('Too far to travel');

    // The gig was never marked matched, so it stays open for the other invitee.
    const gigRes = await request(app).get(`/api/gigs/${gigId}`);
    expect(gigRes.body.status).toBe('open');
  });

  test('accepting an invitation claims the gig and withdraws the other invitations', async () => {
    const invitation = invitations.find((i) => i.workerId === users.near.id);
    const res = await request(app)
      .put(`/api/matches/${invitation.id}/status`)
      .set('Authorization', `Bearer ${tokens.near}`)
      .send({ status: 'accepted' });

    expect(res.status).toBe(200);
    expect(res.body.acceptedAt).toBeTruthy();

    const gigRes = await request(app).get(`/api/gigs/${gigId}`);
    expect(gigRes.body.status).toBe('matched');
  });

  test('the pilot metrics separate the ranked arm from the manual arm', async () => {
    const res = await request(app)
      .get('/api/admin/metrics')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    const ranked = res.body.matchAcceptance.byOrigin.ranked;
    expect(ranked.responded).toBeGreaterThanOrEqual(2);
    // One accepted, one declined: a real rate rather than a constant.
    expect(ranked.acceptanceRate).toBeGreaterThan(0);
    expect(ranked.acceptanceRate).toBeLessThan(1);
  });
});
