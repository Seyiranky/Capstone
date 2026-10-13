import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { offPlatformFlag } from '../../src/lib/offPlatform';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `trust-worker-${stamp}@example.com`,
  client: `trust-client-${stamp}@example.com`,
  admin: `trust-admin-${stamp}@example.com`,
  fresh: `trust-fresh-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const verified = new Date();
  users.worker = await db.User.create({ name: 'Trust Worker', email: emails.worker, passwordHash, role: 'worker', emailVerifiedAt: verified });
  users.client = await db.User.create({ name: 'Trust Client', email: emails.client, passwordHash, role: 'client', emailVerifiedAt: verified });
  users.admin = await db.User.create({ name: 'Trust Admin', email: emails.admin, passwordHash, role: 'admin' });
  users.fresh = await db.User.create({ name: 'Trust Fresh', email: emails.fresh, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  skillId = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill').id;
});

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await db.Report.destroy({ where: { reporterId: ids } });
  await db.Message.destroy({ where: { senderId: ids } });
  await db.Gig.destroy({ where: { clientId: ids } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const gig = (overrides: Record<string, unknown> = {}, who = 'client') =>
  request(app)
    .post('/api/gigs')
    .set(as(who))
    .send({
      title: 'Hem two dresses',
      description: 'Both need shortening by 5cm.',
      budget: 8000,
      skillId,
      locationLat: -1.95,
      locationLng: 30.06,
      ...overrides,
    });

describe('deals taken off the platform', () => {
  test.each([
    ['Pay me on MoMo instead, it is cheaper', 'payment'],
    ['Dial *182*1*1*0788123456# and send it', 'payment'],
    ['Let us do this outside Isoko', 'payment'],
    ['Unyoherereze amafaranga kuri telefoni', 'payment'],
    ['Call me on 0788 123 456 when you arrive', 'contact'],
    ['My WhatsApp is the same number', 'contact'],
    ['I can come on Saturday at 10', null],
    ['The budget is 15,000 RWF for both', null],
  ])('"%s" is flagged as %s', (text, expected) => {
    expect(offPlatformFlag(text)).toBe(expected);
  });

  test('a flagged message is still delivered, carrying its flag', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('worker'))
      .send({ recipientId: users.client.id, body: 'Send the money to my momo and skip the fee' });
    expect(res.status).toBe(201);
    expect(res.body.offPlatformFlag).toBe('payment');
  });
});

describe('reporting a user', () => {
  let reportId: string;

  test('a user can report another, and admins see it', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set(as('client'))
      .send({ reportedUserId: users.worker.id, reason: 'payment_outside', note: 'Asked me to pay on MoMo' });
    expect(res.status).toBe(201);
    reportId = res.body.id;
    const list = await request(app).get('/api/admin/reports').set(as('admin'));
    const report = must(list.body.find((r: { id: string }) => r.id === reportId), 'report');
    expect(report.reportedUser.name).toBe('Trust Worker');
    expect(report.reportedUser).not.toHaveProperty('email');
  });

  test('the same open report cannot be filed twice', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set(as('client'))
      .send({ reportedUserId: users.worker.id, reason: 'other' });
    expect(res.status).toBe(409);
  });

  test('nobody can report themselves, or with a made-up reason', async () => {
    expect((await request(app).post('/api/reports').set(as('client')).send({ reportedUserId: users.client.id, reason: 'other' })).status).toBe(400);
    expect((await request(app).post('/api/reports').set(as('worker')).send({ reportedUserId: users.client.id, reason: 'boring' })).status).toBe(400);
  });

  test('only admins see and resolve reports', async () => {
    expect((await request(app).get('/api/admin/reports').set(as('worker'))).status).toBe(403);
    expect((await request(app).put(`/api/admin/reports/${reportId}`).set(as('client')).send({ status: 'dismissed' })).status).toBe(403);
    const res = await request(app).put(`/api/admin/reports/${reportId}`).set(as('admin')).send({ status: 'actioned', note: 'Warned' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('actioned');
  });
});

describe('who may post and what a gig may say', () => {
  test('an account with no confirmed email or phone cannot post', async () => {
    process.env.CONTACT_GATE_IN_TESTS = '1';
    try {
      const res = await gig({}, 'fresh');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CONTACT_NOT_CONFIRMED');
      expect((await gig()).status).toBe(201);
    } finally {
      delete process.env.CONTACT_GATE_IN_TESTS;
    }
  });

  test('a budget must be a sensible amount, and text has limits', async () => {
    expect((await gig({ budget: -500 })).status).toBe(400);
    expect((await gig({ budget: 'free' })).status).toBe(400);
    expect((await gig({ title: 'x'.repeat(121) })).status).toBe(400);
    expect((await gig({ locationLat: 400 })).status).toBe(400);
  });

  test('rewording an approved gig sends it back to review', async () => {
    const created = (await gig()).body;
    await db.Gig.update({ status: 'open' }, { where: { id: created.id } });
    const res = await request(app).put(`/api/gigs/${created.id}`).set(as('client')).send({ title: 'Hem three dresses' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_review');
  });

  test('a matched gig can no longer be edited', async () => {
    const created = (await gig()).body;
    await db.Gig.update({ status: 'matched' }, { where: { id: created.id } });
    const res = await request(app).put(`/api/gigs/${created.id}`).set(as('client')).send({ budget: 1000 });
    expect(res.status).toBe(409);
  });
});
