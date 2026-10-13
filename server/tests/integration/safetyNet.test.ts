import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `net-worker-${stamp}@example.com`,
  crew: `net-crew-${stamp}@example.com`,
  client: `net-client-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const acceptedJob = async (budget = 40000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Net fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  const tx = must(await db.Transaction.findOne({ where: { matchId: match.id } }), 'tx');
  return { matchId: match.id, txId: tx.id };
};

const fund = (txId: string, safetyNet: number, who = 'client') =>
  request(app).post(`/api/transactions/${txId}/confirm`).set(as(who)).send({ safetyNet });

const release = (matchId: string) =>
  request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });

const net = async (who = 'worker') => (await request(app).get('/api/safety-net/me').set(as(who))).body;

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Net Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.crew = await db.User.create({ name: 'Net Crew', email: emails.crew, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Net Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('client contributions', () => {
  test('a contribution above 20% of the price is refused', async () => {
    const { txId } = await acceptedJob(10000);
    expect((await fund(txId, 2500)).status).toBe(400);
  });

  test('only the client can add one', async () => {
    const { txId } = await acceptedJob(10000);
    expect((await fund(txId, 300, 'worker')).status).toBe(403);
  });

  test("the contribution lands in the worker's pot when the job is paid out", async () => {
    const before = await net();
    const { matchId, txId } = await acceptedJob(40000);
    expect((await fund(txId, 1200)).status).toBe(200);
    expect((await net()).balance).toBe(before.balance); // held, not yet theirs
    await release(matchId);
    const after = await net();
    expect(after.balance - before.balance).toBe(1200);
    expect(after.entries[0].kind).toBe('contribution');
  });

  test('a refunded job puts nothing in the pot', async () => {
    const before = await net();
    const { matchId, txId } = await acceptedJob(20000);
    await fund(txId, 600);
    await request(app).put(`/api/matches/${matchId}/status`).set(as('worker')).send({ status: 'cancelled' });
    expect((await net()).balance).toBe(before.balance);
  });
});

describe('withdrawals', () => {
  test('cannot take out more than the pot holds', async () => {
    const { balance } = await net();
    const res = await request(app).post('/api/safety-net/me/withdraw').set(as('worker')).send({ amount: balance + 100 });
    expect(res.status).toBe(409);
  });

  test('draws the balance down and is recorded with its reason', async () => {
    const { balance } = await net();
    const res = await request(app)
      .post('/api/safety-net/me/withdraw')
      .set(as('worker'))
      .send({ amount: 500, note: 'Clinic visit' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(balance - 500);
    expect(res.body.entries[0]).toMatchObject({ kind: 'withdrawal', note: 'Clinic visit' });
  });

  test('clients do not have a safety net', async () => {
    expect((await request(app).get('/api/safety-net/me').set(as('client'))).status).toBe(403);
  });
});

describe('Ejo Heza savings', () => {
  test('the percentage must be a whole number from 0 to 20', async () => {
    const res = await request(app).put('/api/safety-net/me/savings').set(as('worker')).send({ percent: 25 });
    expect(res.status).toBe(400);
  });

  test('a share of every payout is set aside once the worker opts in', async () => {
    await request(app).put('/api/safety-net/me/savings').set(as('worker')).send({ percent: 10 });
    const before = await net();
    const { matchId, txId } = await acceptedJob(30000);
    await fund(txId, 0);
    await release(matchId);
    const after = await net();
    expect(after.savingsPercent).toBe(10);
    expect(after.ejoHeza - before.ejoHeza).toBe(3000);
  });
});

describe('crew jobs', () => {
  test('a contribution is shared between the crew in proportion to their pay', async () => {
    await request(app).put('/api/safety-net/me/savings').set(as('worker')).send({ percent: 0 });
    const lead = await net('worker');
    const crew = await net('crew');
    const { matchId, txId } = await acceptedJob(40000);
    await db.MatchMember.create({
      matchId,
      userId: users.crew.id,
      role: 'crew',
      sharePercent: 25,
      status: 'joined',
      joinedAt: new Date(),
      endorsement: null,
      endorsementNote: null,
      endorsedAt: null,
    });
    await fund(txId, 1200);
    await release(matchId);
    expect((await net('worker')).balance - lead.balance).toBe(900);
    expect((await net('crew')).balance - crew.balance).toBe(300);
  });
});
