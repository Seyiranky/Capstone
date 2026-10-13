import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as safeVisitService from '../../src/services/safeVisitService';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `visit-worker-${stamp}@example.com`,
  client: `visit-client-${stamp}@example.com`,
  admin: `visit-admin-${stamp}@example.com`,
};
let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const acceptedJob = async () => {
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId: skill.id, title: `Visit fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget: 10000, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  return match.id;
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Visit Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Visit Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Visit Admin', email: emails.admin, passwordHash, role: 'admin' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('trusted contact', () => {
  test('must be a Rwandan mobile number, and is stored in its normal form', async () => {
    expect((await request(app).put('/api/users/me').set(as('worker')).send({ trustedContactPhone: '12345' })).status).toBe(400);
    const res = await request(app)
      .put('/api/users/me')
      .set(as('worker'))
      .send({ trustedContactName: 'Mama', trustedContactPhone: '0788 123 456' });
    expect(res.status).toBe(200);
    expect(res.body.trustedContactPhone).toBe('+250788123456');
  });
});

describe('a safe visit', () => {
  test('check in texts the contact; check out needs a check in first; status follows', async () => {
    const matchId = await acceptedJob();
    expect((await request(app).post(`/api/matches/${matchId}/check-out`).set(as('worker'))).status).toBe(409);
    const ci = await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker')).send({ lat: -1.95, lng: 30.06 });
    expect(ci.status).toBe(201);
    expect(ci.body.contactNotified).toBe(true);
    expect((await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker'))).status).toBe(409);
    expect((await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'))).body.checkedIn).toBe(true);
    expect((await request(app).post(`/api/matches/${matchId}/check-out`).set(as('worker'))).status).toBe(201);
    expect((await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'))).body.checkedIn).toBe(false);
  });

  test('only the worker on the job can check in', async () => {
    const matchId = await acceptedJob();
    expect((await request(app).post(`/api/matches/${matchId}/check-in`).set(as('client'))).status).toBe(403);
  });

  test('an SOS alerts every admin and shows on the safety page until resolved', async () => {
    const matchId = await acceptedJob();
    const res = await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker'));
    expect(res.status).toBe(201);
    const notice = await db.Notification.findOne({ where: { userId: users.admin.id, title: 'SOS from a worker' } });
    expect(notice).toBeTruthy();
    const alerts = await request(app).get('/api/admin/safety-alerts').set(as('admin'));
    const mine = alerts.body.find((a: { id: string }) => a.id === res.body.id);
    expect(mine.resolvedAt).toBeNull();
    await request(app).put(`/api/admin/safety-alerts/${res.body.id}/resolve`).set(as('admin'));
    expect(must(await db.SafetyEvent.findByPk(res.body.id), 'event').resolvedAt).toBeTruthy();
  });

  test('a visit checked in for over 12 hours is flagged once', async () => {
    const matchId = await acceptedJob();
    await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker'));
    const later = new Date(Date.now() + safeVisitService.OVERDUE_AFTER_MS + 60_000);
    await safeVisitService.flagOverdue(undefined, later);
    await safeVisitService.flagOverdue(undefined, later);
    expect(await db.SafetyEvent.count({ where: { matchId, kind: 'overdue' } })).toBe(1);
  });
});
