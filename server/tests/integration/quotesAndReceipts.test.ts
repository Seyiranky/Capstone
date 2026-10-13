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
  worker: `quote-worker-${stamp}@example.com`,
  client: `quote-client-${stamp}@example.com`,
  admin: `quote-admin-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const openGig = (budget = 30000) =>
  db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Quote fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });

/** Applies with a quote, has it approved and accepted, and returns the match id. */
const agreedJob = async (quote: number) => {
  const gig = await openGig();
  const applied = await request(app)
    .post('/api/gig-applications')
    .set(as('worker'))
    .send({ gigId: gig.id, quoteAmount: quote, quoteNote: 'Includes materials' });
  expect(applied.status).toBe(201);
  const approved = await request(app)
    .put(`/api/gig-applications/${applied.body.id}/review`)
    .set(as('admin'))
    .send({ decision: 'approved' });
  expect(approved.status).toBe(200);
  const matchId: string = approved.body.match.id;
  const accepted = await request(app)
    .put(`/api/matches/${matchId}/status`)
    .set(as('worker'))
    .send({ status: 'accepted' });
  expect(accepted.status).toBe(200);
  return { gig, matchId, applicationId: applied.body.id as string };
};

const releaseJob = async (matchId: string) => {
  const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'transaction');
  await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
  const done = await request(app)
    .put(`/api/matches/${matchId}/status`)
    .set(as('client'))
    .send({ status: 'completed' });
  expect(done.status).toBe(200);
  return done.body.transaction;
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Quote Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Quote Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Quote Admin', email: emails.admin, passwordHash, role: 'admin' });
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('quotes', () => {
  test('a quote outside the accepted range is refused', async () => {
    const gig = await openGig();
    const res = await request(app)
      .post('/api/gig-applications')
      .set(as('worker'))
      .send({ gigId: gig.id, quoteAmount: 5 });
    expect(res.status).toBe(400);
  });

  test('applying without a quote still works, and escrow collects the budget', async () => {
    const gig = await openGig(26000);
    const applied = await request(app).post('/api/gig-applications').set(as('worker')).send({ gigId: gig.id });
    expect(applied.status).toBe(201);
    expect(applied.body.quoteAmount).toBeNull();
    const approved = await request(app)
      .put(`/api/gig-applications/${applied.body.id}/review`)
      .set(as('admin'))
      .send({ decision: 'approved' });
    await request(app)
      .put(`/api/matches/${approved.body.match.id}/status`)
      .set(as('worker'))
      .send({ status: 'accepted' });
    const tx = must(await db.Transaction.findOne({ where: { matchId: approved.body.match.id } }), 'tx');
    expect(Number(tx.amount)).toBe(26000);
  });

  test('an approved quote becomes the agreed price, and escrow collects that', async () => {
    const { matchId, applicationId } = await agreedJob(42000);
    const application = must(await db.GigApplication.findByPk(applicationId), 'application');
    expect(Number(application.quoteAmount)).toBe(42000);
    expect(application.quoteNote).toBe('Includes materials');
    expect(Number(must(await db.Match.findByPk(matchId), 'match').agreedAmount)).toBe(42000);
    const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
    expect(Number(tx.amount)).toBe(42000);
  });
});

describe('receipts', () => {
  test('held money has no receipt yet', async () => {
    const { matchId } = await agreedJob(15000);
    const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
    await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
    await tx.reload();
    expect(tx.escrowStatus).toBe('held');
    expect(tx.receiptNumber).toBeNull();
  });

  test('releasing money issues a receipt anyone can check, without contact details', async () => {
    const { gig, matchId } = await agreedJob(31000);
    const released = await releaseJob(matchId);
    expect(released.receiptNumber).toMatch(/^ISK-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

    const res = await request(app).get(`/api/receipts/${released.receiptNumber}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 31000,
      gig: gig.title,
      worker: 'Quote Worker',
      client: 'Quote Client',
      completedVia: 'client',
    });
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  test('an unknown receipt number is a 404', async () => {
    const res = await request(app).get('/api/receipts/ISK-0000-0000');
    expect(res.status).toBe(404);
  });

  test('each income statement line carries its receipt number', async () => {
    const { matchId } = await agreedJob(9000);
    const released = await releaseJob(matchId);
    const res = await request(app).get('/api/users/me/income-statement').set(as('worker'));
    const line = res.body.entries.find((e: { receipt: string }) => e.receipt === released.receiptNumber);
    expect(line?.amount).toBe(9000);
  });
});
