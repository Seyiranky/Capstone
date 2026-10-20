import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { CLIENT_MOMO } from '../helpers/payment';
import * as paymentService from '../../src/services/paymentService';
import type { GigStatus } from '../../src/types/domain';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

// Deleting your own account (Law 058/2021, NFR-7): the person goes, the money
// records stay. SUBMISSION_PLAN Phase 3.

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `del-worker-${stamp}@example.com`,
  client: `del-client-${stamp}@example.com`,
  other: `del-other-${stamp}@example.com`,
  admin: `del-admin-${stamp}@example.com`,
};
const roles: Record<string, 'worker' | 'client' | 'admin'> = { worker: 'worker', client: 'client', other: 'worker', admin: 'admin' };
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

const gigFor = (client = 'client', status: GigStatus = 'open') =>
  db.Gig.create({
    clientId: users[client].id, skillId, title: `Deletion job ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget: 8000, locationLat: -1.95, locationLng: 30.06, status,
  });
const jobInProgress = async (worker = 'worker') => {
  const gig = await gigFor();
  const match = await db.Match.create({ gigId: gig.id, workerId: users[worker].id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as(worker)).send({ status: 'accepted' });
  return { matchId: match.id, gig };
};
const markDone = (matchId: string) =>
  request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
const pay = async (matchId: string) => {
  const res = await request(app).post('/api/transactions/pay').set(as('client')).send({ matchId, phone: CLIENT_MOMO });
  return paymentService.confirm(res.body.id);
};
const check = (who: string) => request(app).get('/api/users/me/deletion-check').set(as(who));
const deleteMe = (who: string, pw: unknown = password) =>
  request(app).delete('/api/users/me').set(as(who)).send({ password: pw });

beforeAll(async () => {
  skillId = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill').id;
  const passwordHash = await bcrypt.hash(password, 10);
  for (const key of Object.keys(emails)) {
    users[key] = await db.User.create({
      name: `Del ${key}`, email: emails[key], passwordHash, role: roles[key],
      phone: key === 'worker' ? `+25078${String(stamp).slice(-7)}` : null,
      bio: key === 'worker' ? 'Tailor in Kimironko' : null,
    });
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await db.Notification.destroy({ where: { userId: ids } });
  await db.Gig.destroy({ where: { clientId: ids } });
  await db.User.destroy({ where: { id: ids } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('what stops a deletion', () => {
  test('an admin cannot delete their own account here', async () => {
    const res = await check('admin');
    expect(res.body).toEqual({ canDelete: false, blockers: [{ code: 'admin' }] });
    expect((await deleteMe('admin')).status).toBe(409);
  });

  test('a job in progress, then money owed, blocks both sides; once paid, nothing does', async () => {
    const { matchId, gig } = await jobInProgress();
    expect((await check('worker')).body.blockers).toContainEqual({ code: 'job_in_progress', gigId: gig.id, title: gig.title });
    expect((await check('client')).body.blockers).toContainEqual({ code: 'job_in_progress', gigId: gig.id, title: gig.title });
    const refused = await deleteMe('worker');
    expect(refused.status).toBe(409);
    expect(refused.body.blockers).toHaveLength(1);

    await markDone(matchId);
    expect((await check('worker')).body.blockers).toContainEqual({ code: 'payment_due', gigId: gig.id, title: gig.title });
    expect((await check('client')).body.blockers).toContainEqual({ code: 'payment_owed', gigId: gig.id, title: gig.title });

    await pay(matchId);
    expect((await check('worker')).body.canDelete).toBe(true);
  });

  test('the password must be right', async () => {
    expect((await deleteMe('worker', 'wrong-password')).status).toBe(403);
    expect((await deleteMe('worker', null)).status).toBe(403);
  });
});

describe('deleting a worker account', () => {
  let paidMatchId: string;
  let receiptNumber: string;
  let invitedGigTitle: string;

  beforeAll(async () => {
    // A finished, paid job (whose receipt must survive), a waiting application,
    // and an invitation the client is waiting on.
    const { matchId } = await jobInProgress();
    await markDone(matchId);
    await pay(matchId);
    paidMatchId = matchId;
    receiptNumber = must(await db.Payout.findOne({ where: { matchId } }), 'payout').receiptNumber;
    const applyTo = await gigFor();
    await db.GigApplication.create({ gigId: applyTo.id, workerId: users.worker.id, status: 'pending' });
    const invited = await gigFor();
    invitedGigTitle = invited.title;
    await db.Match.create({ gigId: invited.id, workerId: users.worker.id, origin: 'direct' });
  });

  test('succeeds, and the person is gone: name, email, phone, profile, sign-in', async () => {
    expect((await deleteMe('worker')).status).toBe(204);
    const row = must(await db.User.findByPk(users.worker.id), 'row');
    expect(row.status).toBe('deleted');
    expect(row.name).toBe('Deleted user');
    expect(row.email).not.toBe(emails.worker);
    expect(row.phone).toBeNull();
    expect(row.bio).toBeNull();

    expect((await request(app).post('/api/auth/login').send({ email: emails.worker, password })).status).toBe(401);
    expect((await request(app).get('/api/users/me').set(as('worker'))).status).toBe(401);
    expect((await request(app).get(`/api/users/${users.worker.id}`).set(as('client'))).status).toBe(404);
  });

  test('the money records stay: the receipt still checks, under "Deleted user"', async () => {
    const receipt = await request(app).get(`/api/receipts/${receiptNumber}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.worker).toBe('Deleted user');
    expect(await db.Transaction.count({ where: { matchId: paidMatchId, status: 'confirmed' } })).toBe(1);
  });

  test('what had not started is closed, and whoever was waiting is told', async () => {
    expect(await db.GigApplication.count({ where: { workerId: users.worker.id, status: 'pending' } })).toBe(0);
    expect(await db.Match.count({ where: { workerId: users.worker.id, status: 'pending' } })).toBe(0);
    const told = await db.Notification.findAll({ where: { userId: users.client.id, title: 'Job no longer available' } });
    expect(told.some((n) => n.body.includes(invitedGigTitle))).toBe(true);
  });

  test('an admin cannot bring it back, and the address can sign up again', async () => {
    const reactivate = await request(app)
      .put(`/api/admin/users/${users.worker.id}/moderate`)
      .set(as('admin'))
      .send({ action: 'activate' });
    expect([404, 409]).toContain(reactivate.status);
    const again = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Del Worker Again', email: emails.worker, password, role: 'worker' });
    expect(again.status).toBe(201);
  });
});

describe('deleting a client account', () => {
  test('their gigs not yet under way are withdrawn and applicants told', async () => {
    const gig = await gigFor('client');
    await db.GigApplication.create({ gigId: gig.id, workerId: users.other.id, status: 'pending' });
    expect((await deleteMe('client')).status).toBe(204);
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('cancelled');
    expect(must(await db.GigApplication.findOne({ where: { gigId: gig.id } }), 'application').status).toBe('withdrawn');
    const told = await db.Notification.findAll({ where: { userId: users.other.id, title: 'Gig withdrawn' } });
    expect(told.some((n) => n.body.includes(gig.title))).toBe(true);
  });
});
