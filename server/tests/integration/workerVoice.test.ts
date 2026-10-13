import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  paid: `voice-paid-${stamp}@example.com`,
  newcomer: `voice-new-${stamp}@example.com`,
  client: `voice-client-${stamp}@example.com`,
  admin: `voice-admin-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const pollIds: string[] = [];

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  users.paid = await db.User.create({ name: 'Voice Paid', email: emails.paid, passwordHash, role: 'worker' });
  users.newcomer = await db.User.create({ name: 'Voice New', email: emails.newcomer, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Voice Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Voice Admin', email: emails.admin, passwordHash, role: 'admin' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  // One paid job makes a worker a voter.
  const skill = must(await db.Skill.findOne({ where: { category: 'tailoring' } }), 'skill');
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId: skill.id, title: 'Voice fixture', description: 'Fixture',
    budget: 10000, locationLat: -1.95, locationLng: 30.06, status: 'completed',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.paid.id, status: 'completed' });
  const tx = await db.Transaction.create({
    matchId: match.id, amount: 10000, status: 'confirmed', escrowStatus: 'released', releasedAt: new Date(),
    provider: 'simulated-momo', reference: `MOMO-SIM-${stamp}`,
  });
  await db.Payout.create({
    transactionId: tx.id, matchId: match.id, userId: users.paid.id, role: 'lead', amount: 10000,
    receiptNumber: `ISK-VOICE-${String(stamp).slice(-6)}`, releasedAt: new Date(),
  });
});

afterAll(async () => {
  await db.Poll.destroy({ where: { id: pollIds } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const newPoll = (body: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/voice')
    .set(as('admin'))
    .send({ question: 'Should the safety net suggestion rise from 3% to 5%?', options: ['Yes, 5%', 'Keep 3%'], closesInDays: 7, ...body });

describe('opening a poll', () => {
  test('only admins can, and options must make sense', async () => {
    expect((await request(app).post('/api/voice').set(as('paid')).send({ question: 'x', options: ['a', 'b'] })).status).toBe(403);
    expect((await newPoll({ options: ['Only one'] })).status).toBe(400);
    expect((await newPoll({ options: ['Same', 'same'] })).status).toBe(400);
    expect((await newPoll({ closesInDays: 90 })).status).toBe(400);
    const res = await newPoll();
    expect(res.status).toBe(201);
    pollIds.push(res.body.id);
  });
});

describe('voting', () => {
  test('a worker with a paid job votes once, and the count is public', async () => {
    const id = pollIds[0];
    expect((await request(app).post(`/api/voice/${id}/vote`).set(as('paid')).send({ optionIndex: 0 })).status).toBe(201);
    expect((await request(app).post(`/api/voice/${id}/vote`).set(as('paid')).send({ optionIndex: 1 })).status).toBe(409);
    const anonymous = await request(app).get('/api/voice');
    const poll = must(anonymous.body.find((p: { id: string }) => p.id === id), 'poll');
    expect(poll.counts).toEqual([1, 0]);
    expect(poll).not.toHaveProperty('votes');
    const mine = (await request(app).get('/api/voice').set(as('paid'))).body.find((p: { id: string }) => p.id === id);
    expect(mine.myVote).toBe(0);
    expect(mine.canVote).toBe(false);
  });

  test('a worker who has never been paid through Isoko cannot vote yet', async () => {
    const res = await request(app).post(`/api/voice/${pollIds[0]}/vote`).set(as('newcomer')).send({ optionIndex: 1 });
    expect(res.status).toBe(403);
    const view = (await request(app).get('/api/voice').set(as('newcomer'))).body.find((p: { id: string }) => p.id === pollIds[0]);
    expect(view.canVote).toBe(false);
  });

  test('clients do not vote on workers’ rules', async () => {
    expect((await request(app).post(`/api/voice/${pollIds[0]}/vote`).set(as('client')).send({ optionIndex: 0 })).status).toBe(403);
  });

  test('a vote for an option that does not exist is refused', async () => {
    const res = await newPoll({ question: 'Second question for workers?' });
    pollIds.push(res.body.id);
    expect((await request(app).post(`/api/voice/${res.body.id}/vote`).set(as('paid')).send({ optionIndex: 7 })).status).toBe(400);
  });
});

describe('closing a poll', () => {
  test('needs the platform’s response, which is then public, and voting stops', async () => {
    const id = pollIds[0];
    expect((await request(app).put(`/api/voice/${id}/close`).set(as('admin')).send({ outcome: 'ok' })).status).toBe(400);
    const res = await request(app)
      .put(`/api/voice/${id}/close`)
      .set(as('admin'))
      .send({ outcome: 'Workers chose 5%. The suggestion on the pay-in screen is now 5%.' });
    expect(res.status).toBe(200);
    const poll = (await request(app).get('/api/voice')).body.find((p: { id: string }) => p.id === id);
    expect(poll.phase).toBe('closed');
    expect(poll.outcome).toMatch(/now 5%/);
    expect((await request(app).post(`/api/voice/${pollIds[1]}/vote`).set(as('paid')).send({ optionIndex: 0 })).status).toBe(201);
  });

  test('a decided poll earns Fairwork’s representation point', async () => {
    const card = (await request(app).get('/api/fairwork')).body;
    const check = card.principles.find((p: { key: string }) => p.key === 'representation').checks.find((c: { key: string }) => c.key === 'workerVoice');
    expect(check.value).toBeGreaterThanOrEqual(1);
    expect(check.met).toBe(true);
  });
});
