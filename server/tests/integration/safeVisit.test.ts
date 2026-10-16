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
  crew: `visit-crew-${stamp}@example.com`,
  stranger: `visit-stranger-${stamp}@example.com`,
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
  users.crew = await db.User.create({ name: 'Visit Crew', email: emails.crew, passwordHash, role: 'worker' });
  users.stranger = await db.User.create({ name: 'Visit Stranger', email: emails.stranger, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Visit Client', email: emails.client, passwordHash, role: 'client', phone: '+250788000111' });
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
    expect((await request(app).put(`/api/admin/safety-alerts/${res.body.id}/resolve`).set(as('admin')).send({})).status).toBe(400);
    await request(app).put(`/api/admin/safety-alerts/${res.body.id}/resolve`).set(as('admin')).send({ note: 'Called the worker; all fine.' });
    const closed = must(await db.SafetyEvent.findByPk(res.body.id), 'event');
    expect(closed.resolvedAt).toBeTruthy();
    expect(closed.resolutionNote).toBe('Called the worker; all fine.');
    expect(closed.resolvedBy).toBe(users.admin.id);
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

describe('SOS, end to end', () => {
  test('an alert gives the admin everyone to call and where the job is', async () => {
    const matchId = await acceptedJob();
    const res = await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker')).send({ lat: -1.944, lng: 30.061 });
    const alerts = await request(app).get('/api/admin/safety-alerts').set(as('admin'));
    const mine = alerts.body.find((a: { id: string }) => a.id === res.body.id);
    expect(mine.user).toMatchObject({ name: 'Visit Worker', trustedContactName: 'Mama', trustedContactPhone: '+250788123456' });
    expect(mine.client).toMatchObject({ name: 'Visit Client', phone: '+250788000111' });
    expect(mine.area).toBeTruthy();
    expect(mine.lat).toBeCloseTo(-1.944);
    expect((await request(app).get('/api/admin/safety-alerts/open-count').set(as('admin'))).body.count).toBeGreaterThan(0);
  });

  test('pressing SOS again within two minutes joins the open alert', async () => {
    const matchId = await acceptedJob();
    const first = await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker'));
    const second = await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker')).send({ lat: -1.95, lng: 30.06 });
    expect(second.body.id).toBe(first.body.id);
    expect(await db.SafetyEvent.count({ where: { matchId, kind: 'sos' } })).toBe(1);
    expect(must(await db.SafetyEvent.findByPk(first.body.id), 'sos').lat).toBeCloseTo(-1.95);
  });

  test('an SOS is saved even when the trusted contact cannot be texted', async () => {
    const matchId = await acceptedJob();
    await db.User.update({ trustedContactPhone: null }, { where: { id: users.crew.id } });
    await db.MatchMember.create({ matchId, userId: users.crew.id, role: 'crew', sharePercent: 0, status: 'joined', joinedAt: new Date() } as never);
    const res = await request(app).post(`/api/matches/${matchId}/sos`).set(as('crew'));
    expect(res.status).toBe(201);
    expect(res.body.contactNotified).toBe(false);
  });

  test('a crew member on the job can check in and raise an SOS; someone else cannot', async () => {
    const matchId = await acceptedJob();
    await db.MatchMember.create({ matchId, userId: users.crew.id, role: 'crew', sharePercent: 0, status: 'joined', joinedAt: new Date() } as never);
    expect((await request(app).post(`/api/matches/${matchId}/check-in`).set(as('crew'))).status).toBe(201);
    // Each person's visit is their own: the lead is not checked in by the crew's arrival.
    expect((await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'))).body.checkedIn).toBe(false);
    expect((await request(app).get(`/api/matches/${matchId}/visit`).set(as('crew'))).body.checkedIn).toBe(true);
    expect((await request(app).post(`/api/matches/${matchId}/sos`).set(as('stranger'))).status).toBe(403);
  });

  test('after the client marks the job done, a checked-in worker can still check out and raise an SOS', async () => {
    const matchId = await acceptedJob();
    await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker'));
    await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
    expect((await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker'))).status).toBe(201);
    expect((await request(app).post(`/api/matches/${matchId}/check-out`).set(as('worker'))).status).toBe(201);
    // Once out, a closed job takes no new arrivals.
    expect((await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker'))).status).toBe(409);
  });

  test('"I am on it" tells the worker, and the worker’s card shows each step', async () => {
    const matchId = await acceptedJob();
    const res = await request(app).post(`/api/matches/${matchId}/sos`).set(as('worker'));
    let visit = await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'));
    expect(visit.body.sos).toMatchObject({ id: res.body.id, acknowledgedAt: null, resolvedAt: null });

    await request(app).put(`/api/admin/safety-alerts/${res.body.id}/acknowledge`).set(as('admin'));
    expect(await db.Notification.count({ where: { userId: users.worker.id, title: 'Isoko has seen your SOS' } })).toBeGreaterThan(0);
    visit = await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'));
    expect(visit.body.sos.acknowledgedAt).toBeTruthy();

    await request(app).put(`/api/admin/safety-alerts/${res.body.id}/resolve`).set(as('admin')).send({ note: 'Spoke to the worker.' });
    visit = await request(app).get(`/api/matches/${matchId}/visit`).set(as('worker'));
    expect(visit.body.sos.resolvedAt).toBeTruthy();
  });

  test('the overdue notice names the worker and the job', async () => {
    const matchId = await acceptedJob();
    await request(app).post(`/api/matches/${matchId}/check-in`).set(as('worker'));
    await safeVisitService.flagOverdue(undefined, new Date(Date.now() + safeVisitService.OVERDUE_AFTER_MS + 60_000));
    const notice = await db.Notification.findOne({ where: { userId: users.admin.id, title: 'Visit not checked out' }, order: [['createdAt', 'DESC']] });
    expect(notice?.body).toContain('Visit Worker');
    expect(notice?.body).toContain('Visit fixture');
  });

  test('only admins see and close alerts', async () => {
    expect((await request(app).get('/api/admin/safety-alerts').set(as('worker'))).status).toBe(403);
  });
});
