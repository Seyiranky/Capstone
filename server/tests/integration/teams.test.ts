import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { splitShares } from '../../src/services/payoutService';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  lead: `team-lead-${stamp}@example.com`,
  crewA: `team-crewa-${stamp}@example.com`,
  crewB: `team-crewb-${stamp}@example.com`,
  apprentice: `team-apprentice-${stamp}@example.com`,
  unverified: `team-unverified-${stamp}@example.com`,
  client: `team-client-${stamp}@example.com`,
  admin: `team-admin-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const openGig = (budget = 40000) =>
  db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Team fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });

/** Applies (optionally with a crew), is approved, and accepts. Returns the match id. */
const acceptedJob = async (lead: string, crew?: { userId: string; sharePercent: number }[], budget = 40000) => {
  const gig = await openGig(budget);
  const applied = await request(app).post('/api/gig-applications').set(as(lead)).send({ gigId: gig.id, crew });
  expect(applied.status).toBe(201);
  const approved = await request(app)
    .put(`/api/gig-applications/${applied.body.id}/review`)
    .set(as('admin'))
    .send({ decision: 'approved' });
  const matchId: string = approved.body.match.id;
  await request(app).put(`/api/matches/${matchId}/status`).set(as(lead)).send({ status: 'accepted' });
  return { gig, matchId, applicationId: applied.body.id as string };
};

const fundAndRelease = async (matchId: string) => {
  const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
  await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
  await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
};

const memberRow = async (matchId: string, who: string) =>
  must(await db.MatchMember.findOne({ where: { matchId, userId: users[who].id } }), `${who} member`);

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  for (const [key, role] of [
    ['lead', 'worker'], ['crewA', 'worker'], ['crewB', 'worker'], ['apprentice', 'worker'],
    ['unverified', 'worker'], ['client', 'client'], ['admin', 'admin'],
  ] as const) {
    users[key] = await db.User.create({ name: `Team ${key}`, email: emails[key], passwordHash, role });
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  // The lead is verified in the trade; that is what lets them take an apprentice.
  await db.UserSkill.create({
    userId: users.lead.id,
    skillId: skill.id,
    proficiencyLevel: 4,
    verificationStatus: 'verified',
    provenanceDetail: null,
    selfDeclaredAt: null,
  });
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('splitting a payout', () => {
  test('shares round down and the lead takes the remainder, so the parts add up', () => {
    const parts = splitShares(10001, 'lead', [
      { userId: 'a', role: 'crew', sharePercent: 33 },
      { userId: 'b', role: 'apprentice', sharePercent: 10 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(10001);
    expect(parts.find((p) => p.userId === 'a')?.amount).toBe(3300);
    expect(parts.find((p) => p.userId === 'lead')?.amount).toBe(5701);
  });
});

describe('naming a crew', () => {
  test('workers can be found by name to add', async () => {
    const res = await request(app).get('/api/users/search').query({ q: 'Team crew' }).set(as('lead'));
    const names = res.body.map((u: { name: string }) => u.name);
    expect(names).toEqual(expect.arrayContaining(['Team crewA', 'Team crewB']));
    expect(names).not.toContain('Team lead');
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  test.each([
    ['shares that leave the lead under 10%', () => [{ userId: users.crewA.id, sharePercent: 91 }]],
    ['naming yourself', () => [{ userId: users.lead.id, sharePercent: 10 }]],
    ['naming someone twice', () => [{ userId: users.crewA.id, sharePercent: 10 }, { userId: users.crewA.id, sharePercent: 10 }]],
    ['a client as crew', () => [{ userId: users.client.id, sharePercent: 10 }]],
  ])('refuses %s', async (_label, crew) => {
    const gig = await openGig();
    const res = await request(app).post('/api/gig-applications').set(as('lead')).send({ gigId: gig.id, crew: crew() });
    expect(res.status).toBe(400);
  });
});

describe('a crew job, start to payout', () => {
  let matchId: string;

  test('the client sees the crew on the application', async () => {
    const gig = await openGig();
    const applied = await request(app)
      .post('/api/gig-applications')
      .set(as('lead'))
      .send({
        gigId: gig.id,
        crew: [
          { userId: users.crewA.id, sharePercent: 30 },
          { userId: users.crewB.id, sharePercent: 20 },
        ],
      });
    const list = await request(app).get('/api/gig-applications').query({ gigId: gig.id }).set(as('client'));
    const crew = list.body.find((a: { id: string }) => a.id === applied.body.id).crew;
    expect(crew.map((c: { name: string }) => c.name)).toEqual(['Team crewA', 'Team crewB']);

    const approved = await request(app)
      .put(`/api/gig-applications/${applied.body.id}/review`)
      .set(as('admin'))
      .send({ decision: 'approved' });
    matchId = approved.body.match.id;
    await request(app).put(`/api/matches/${matchId}/status`).set(as('lead')).send({ status: 'accepted' });
  });

  test('accepting invites the crew; they join or decline, and see the job', async () => {
    expect((await memberRow(matchId, 'crewA')).status).toBe('invited');
    const a = await memberRow(matchId, 'crewA');
    const b = await memberRow(matchId, 'crewB');
    expect((await request(app).post(`/api/team/${a.id}/respond`).set(as('crewB')).send({ accept: true })).status).toBe(404);
    expect((await request(app).post(`/api/team/${a.id}/respond`).set(as('crewA')).send({ accept: true })).status).toBe(200);
    expect((await request(app).post(`/api/team/${b.id}/respond`).set(as('crewB')).send({ accept: false })).status).toBe(200);

    const seen = await request(app).get('/api/matches').set(as('crewA'));
    expect(seen.body.map((m: { id: string }) => m.id)).toContain(matchId);
  });

  test('release pays each person their share, with their own receipt', async () => {
    await fundAndRelease(matchId);
    const payouts = await db.Payout.findAll({ where: { matchId } });
    const byUser = new Map(payouts.map((p) => [p.userId, p]));
    // crewB declined, so their 20% stays with the lead.
    expect(Number(byUser.get(users.crewA.id)?.amount)).toBe(12000);
    expect(Number(byUser.get(users.lead.id)?.amount)).toBe(28000);
    expect(byUser.has(users.crewB.id)).toBe(false);
    expect(new Set(payouts.map((p) => p.receiptNumber)).size).toBe(2);

    const receipt = await request(app).get(`/api/receipts/${byUser.get(users.crewA.id)?.receiptNumber}`);
    expect(receipt.body).toMatchObject({ amount: 12000, role: 'crew', worker: 'Team crewA' });
  });

  test("each person's income and history show only their part", async () => {
    const lead = await request(app).get('/api/users/me/income-statement').set(as('lead'));
    const crew = await request(app).get('/api/users/me/income-statement').set(as('crewA'));
    expect(lead.body.entries.find((e: { amount: number }) => e.amount === 40000)).toBeUndefined();
    expect(crew.body.summary.totalEarned).toBe(12000);

    const history = await request(app).get(`/api/users/${users.crewA.id}/work-history`).set(as('client'));
    expect(history.body[0].role).toBe('crew');
  });
});

describe('apprentices', () => {
  test('only a lead verified in the trade can take one', async () => {
    const { matchId } = await acceptedJob('unverified');
    const res = await request(app)
      .post(`/api/matches/${matchId}/apprentice`)
      .set(as('unverified'))
      .send({ apprenticeId: users.apprentice.id, sharePercent: 10 });
    expect(res.status).toBe(403);
  });

  test('a share above 30% is refused, and a job takes one apprentice', async () => {
    const { matchId } = await acceptedJob('lead');
    const tooMuch = await request(app)
      .post(`/api/matches/${matchId}/apprentice`)
      .set(as('lead'))
      .send({ apprenticeId: users.apprentice.id, sharePercent: 31 });
    expect(tooMuch.status).toBe(400);
    const first = await request(app)
      .post(`/api/matches/${matchId}/apprentice`)
      .set(as('lead'))
      .send({ apprenticeId: users.apprentice.id, sharePercent: 20 });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post(`/api/matches/${matchId}/apprentice`)
      .set(as('lead'))
      .send({ apprenticeId: users.crewA.id, sharePercent: 0 });
    expect(second.status).toBe(409);
  });

  test('a paid, endorsed apprenticeship becomes supervised evidence, never a peer review', async () => {
    const { matchId } = await acceptedJob('lead');
    const invited = await request(app)
      .post(`/api/matches/${matchId}/apprentice`)
      .set(as('lead'))
      .send({ apprenticeId: users.apprentice.id, sharePercent: 20 });
    await request(app).post(`/api/team/${invited.body.id}/respond`).set(as('apprentice')).send({ accept: true });

    const early = await request(app).post(`/api/team/${invited.body.id}/endorse`).set(as('lead')).send({ endorse: true });
    expect(early.status).toBe(409);

    await fundAndRelease(matchId);
    const payout = must(await db.Payout.findOne({ where: { matchId, userId: users.apprentice.id } }), 'payout');
    expect(Number(payout.amount)).toBe(8000);
    expect(payout.role).toBe('apprentice');

    const assignmentsBefore = await db.SkillTaskAssignment.count();
    const endorsed = await request(app)
      .post(`/api/team/${invited.body.id}/endorse`)
      .set(as('lead'))
      .send({ endorse: true, note: 'Measured and cut carefully' });
    expect(endorsed.status).toBe(200);
    const userSkill = must(
      await db.UserSkill.findOne({ where: { userId: users.apprentice.id, skillId: skill.id } }),
      'apprentice skill',
    );
    expect(userSkill.provenance).toBe('supervised');
    expect(userSkill.verificationStatus).not.toBe('verified');
    expect(await db.SkillTaskAssignment.count()).toBe(assignmentsBefore);

    const twice = await request(app).post(`/api/team/${invited.body.id}/endorse`).set(as('lead')).send({ endorse: true });
    expect(twice.status).toBe(409);
  });
});
