import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { payForJob } from '../helpers/payment';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `cover-worker-${stamp}@example.com`,
  other: `cover-other-${stamp}@example.com`,
  client: `cover-client-${stamp}@example.com`,
  admin: `cover-admin-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const acceptedJob = async (category: 'tailoring' | 'digital_web', budget = 40000) => {
  const skill = must(await db.Skill.findOne({ where: { category, parentId: null } }), 'skill');
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId: skill.id, title: `Cover fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  return { matchId: match.id };
};
const addCover = (matchId: string, who = 'client') => request(app).post(`/api/matches/${matchId}/cover`).set(as(who));
const claim = (matchId: string, body: Record<string, unknown>, who = 'worker') =>
  request(app).post(`/api/matches/${matchId}/cover-claims`).set(as(who)).send(body);
const injury = { description: 'Cut my hand on the cutting table; three stitches at the health centre.', amount: 12000 };

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Cover Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.other = await db.User.create({ name: 'Cover Other', email: emails.other, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Cover Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Cover Admin', email: emails.admin, passwordHash, role: 'admin' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('buying cover', () => {
  test('the client adds it while on-site work is under way: 2%, with a policy number', async () => {
    const { matchId } = await acceptedJob('tailoring', 40000);
    const before = (await request(app).get(`/api/matches/${matchId}/cover`).set(as('client'))).body;
    expect(before).toMatchObject({ eligible: true, covered: false, canBuy: true, premium: 800 });
    expect((await addCover(matchId, 'worker')).status).toBe(403);
    expect((await addCover(matchId)).status).toBe(201);
    const after = (await request(app).get(`/api/matches/${matchId}/cover`).set(as('worker'))).body;
    expect(after.covered).toBe(true);
    expect(after.policyNumber).toMatch(/^COV-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(after.canClaim).toBe(true);
  });

  test('a small job pays the minimum premium', async () => {
    const { matchId } = await acceptedJob('tailoring', 5000);
    expect((await request(app).get(`/api/matches/${matchId}/cover`).set(as('client'))).body.premium).toBe(300);
  });

  test('a job paid in advance (under escrow) cannot take cover: there is no payment to bill it to', async () => {
    const { matchId } = await acceptedJob('tailoring', 30000);
    await db.Transaction.create({
      matchId, amount: 30000, currency: 'RWF', status: 'confirmed', provider: 'simulated-momo',
      reference: `ISK-advance-${Math.random().toString(36).slice(2)}`, escrowStatus: 'held', heldAt: new Date(),
    });
    expect((await request(app).get(`/api/matches/${matchId}/cover`).set(as('client'))).body.canBuy).toBe(false);
    expect((await addCover(matchId)).status).toBe(409);
  });

  test('digital work done from the worker’s own desk cannot be covered', async () => {
    const { matchId } = await acceptedJob('digital_web');
    expect((await addCover(matchId)).status).toBe(400);
  });

  test('only people on the job see its cover', async () => {
    const { matchId } = await acceptedJob('tailoring');
    expect((await request(app).get(`/api/matches/${matchId}/cover`).set(as('other'))).status).toBe(403);
  });
});

describe('claims', () => {
  let matchId: string;
  let claimId: string;

  beforeAll(async () => {
    const job = await acceptedJob('tailoring', 40000);
    matchId = job.matchId;
    await addCover(matchId);
  });

  test('need a real description and an amount within the limit', async () => {
    expect((await claim(matchId, { description: 'hurt', amount: 5000 })).status).toBe(400);
    expect((await claim(matchId, { ...injury, amount: 400000 })).status).toBe(400);
  });

  test('only a worker on the job can claim, and only one at a time', async () => {
    expect((await claim(matchId, injury, 'other')).status).toBe(403);
    const res = await claim(matchId, injury);
    expect(res.status).toBe(201);
    claimId = res.body.id;
    expect((await claim(matchId, injury)).status).toBe(409);
  });

  test('an uncovered job cannot be claimed on', async () => {
    const { matchId: uncovered } = await acceptedJob('tailoring');
    expect((await claim(uncovered, injury)).status).toBe(409);
  });

  test('admins decide: a decline needs a reason, an approval no more than was claimed', async () => {
    expect((await request(app).put(`/api/admin/cover-claims/${claimId}`).set(as('worker')).send({ status: 'approved' })).status).toBe(403);
    expect((await request(app).put(`/api/admin/cover-claims/${claimId}`).set(as('admin')).send({ status: 'declined' })).status).toBe(400);
    expect(
      (await request(app).put(`/api/admin/cover-claims/${claimId}`).set(as('admin')).send({ status: 'approved', amountApproved: 99999 })).status,
    ).toBe(400);
    const res = await request(app).put(`/api/admin/cover-claims/${claimId}`).set(as('admin')).send({ status: 'approved', amountApproved: 10000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'approved', amountApproved: 10000 });
    const list = (await request(app).get('/api/admin/cover-claims').set(as('admin'))).body;
    expect(list.find((c: { id: string }) => c.id === claimId).user).not.toHaveProperty('email');
  });

  test('the premium is billed in the MoMo payment, and the policy is printed on the receipt', async () => {
    const { pay } = await payForJob(matchId, tokens.client);
    expect(Number(pay.body.coverPremium)).toBe(800);
    const payout = must(await db.Payout.findOne({ where: { matchId } }), 'payout');
    const receipt = (await request(app).get(`/api/receipts/${payout.receiptNumber}`)).body;
    expect(receipt.cover.policyNumber).toMatch(/^COV-/);
    expect(receipt.cover.premium).toBe(800);
  });
});
