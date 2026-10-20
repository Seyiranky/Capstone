import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { CLIENT_MOMO } from '../helpers/payment';
import * as paymentService from '../../src/services/paymentService';
import * as completionService from '../../src/services/completionService';
import * as trustScoreService from '../../src/services/trustScoreService';
import simulatedAdapter from '../../src/services/payments/simulatedAdapter';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

// The job flow from acceptance to review, and the gaps found walking it
// (SUBMISSION_PLAN Phase 1b).

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `flow-worker-${stamp}@example.com`,
  client: `flow-client-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

const jobInProgress = async (budget = 20000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId, title: `Flow job ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  return { matchId: match.id, title: gig.title };
};
const setStatus = (matchId: string, who: string, status: string) =>
  request(app).put(`/api/matches/${matchId}/status`).set(as(who)).send({ status });
const pay = (matchId: string) =>
  request(app).post('/api/transactions/pay').set(as('client')).send({ matchId, phone: CLIENT_MOMO });
const noticesFor = (who: string, title: string) =>
  db.Notification.findAll({ where: { userId: users[who].id, title } });
const abandoned = async (who: string) => {
  const breakdown = must(await trustScoreService.recalculate(users[who].id), 'breakdown');
  const completion = must(breakdown.components.find((c) => c.key === 'completion'), 'completion');
  return (completion.detail as { abandoned: number }).abandoned;
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  skillId = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill').id;
  users.worker = await db.User.create({ name: 'Flow Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Flow Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  jest.restoreAllMocks();
  const ids = Object.values(users).map((u) => u.id);
  await db.Notification.destroy({ where: { userId: ids } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('calling off a job under way', () => {
  test('counts against the worker who called it off, not the client', async () => {
    const before = { worker: await abandoned('worker'), client: await abandoned('client') };
    const { matchId } = await jobInProgress();
    expect((await setStatus(matchId, 'worker', 'cancelled')).status).toBe(200);
    expect(must(await db.Match.findByPk(matchId), 'match').cancelledVia).toBe('worker');
    expect(await abandoned('worker')).toBe(before.worker + 1);
    expect(await abandoned('client')).toBe(before.client);
  });

  test('counts against the client who called it off, not the worker', async () => {
    const before = { worker: await abandoned('worker'), client: await abandoned('client') };
    const { matchId } = await jobInProgress();
    expect((await setStatus(matchId, 'client', 'cancelled')).status).toBe(200);
    expect(must(await db.Match.findByPk(matchId), 'match').cancelledVia).toBe('client');
    expect(await abandoned('client')).toBe(before.client + 1);
    expect(await abandoned('worker')).toBe(before.worker);
  });

  test('the other person is told, not the one who called it off', async () => {
    const { matchId, title } = await jobInProgress();
    await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'cancelled', declineReason: 'Plans changed' });
    const workerTold = (await noticesFor('worker', 'Job called off')).filter((n) => n.body.includes(title));
    expect(workerTold).toHaveLength(1);
    expect(workerTold[0].body).toContain('Plans changed');
    const clientTold = (await noticesFor('client', 'Match cancelled')).filter((n) => n.body.includes(title));
    expect(clientTold).toHaveLength(0);
  });

  test('is refused while a dispute is open; the mediators decide', async () => {
    const { matchId } = await jobInProgress();
    const dispute = await request(app)
      .post('/api/disputes')
      .set(as('worker'))
      .send({ matchId, reason: 'notMarkedDone', details: 'Finished on Monday; the client has not marked it done.' });
    expect(dispute.status).toBe(201);
    expect((await setStatus(matchId, 'client', 'cancelled')).status).toBe(409);
  });
});

describe('the worker says the work is finished', () => {
  test('the client is asked to mark it done, once however often it is said', async () => {
    const { matchId, title } = await jobInProgress();
    const first = await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'));
    expect(first.status).toBe(200);
    expect(first.body.workDoneAt).toBeTruthy();
    await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'));
    const told = (await noticesFor('client', 'Work finished')).filter((n) => n.body.includes(title));
    expect(told).toHaveLength(1);
  });

  test('only the worker can say it, and only while the job is under way', async () => {
    const { matchId } = await jobInProgress();
    expect((await request(app).post(`/api/matches/${matchId}/work-done`).set(as('client'))).status).toBe(403);
    await setStatus(matchId, 'client', 'completed');
    expect((await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'))).status).toBe(409);
  });

  test('a client who has not marked it done two days later is reminded, once', async () => {
    const { matchId, title } = await jobInProgress();
    await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'));
    const later = new Date(Date.now() + completionService.WORK_DONE_REMINDER_MS + 60_000);
    await completionService.remindWorkDone(undefined, later);
    await completionService.remindWorkDone(undefined, later);
    const reminders = (await noticesFor('client', 'Waiting for you to mark the job done')).filter((n) =>
      n.body.includes(title),
    );
    expect(reminders).toHaveLength(1);
  });

  test("a worker's in-progress dispute offers 'not marked done', no longer 'money not released'", async () => {
    const { matchId } = await jobInProgress();
    const eligible = await request(app).get('/api/disputes/eligible').set(as('worker'));
    const row = must(eligible.body.find((r: { matchId: string }) => r.matchId === matchId), 'eligibility');
    expect(row.reasons).toContain('notMarkedDone');
    expect(row.reasons).not.toContain('notReleased');
    const refused = await request(app)
      .post('/api/disputes')
      .set(as('worker'))
      .send({ matchId, reason: 'notReleased', details: 'Old reason' });
    expect(refused.status).toBe(400);
  });
});

describe('settling a payment tells everyone, by whichever path it settles', () => {
  test('a payment the background check settles still tells the worker they were paid', async () => {
    const { matchId, title } = await jobInProgress(18000);
    await setStatus(matchId, 'client', 'completed');
    expect((await pay(matchId)).status).toBe(201);
    // The client closed the page; no callback came. Only the server's sweep runs.
    jest
      .spyOn(simulatedAdapter, 'checkStatus')
      .mockResolvedValue({ status: 'SUCCESSFUL', failureReason: null, raw: { simulated: true } });
    await paymentService.refreshPending();
    jest.restoreAllMocks();
    const paid = (await noticesFor('worker', 'You have been paid')).filter((n) => n.body.includes(title));
    expect(paid).toHaveLength(1);
    expect(paid[0].body).toContain('18,000');
  });

  test('a failed payment tells the client too, and the retry keeps the failed attempt', async () => {
    const { matchId, title } = await jobInProgress();
    await setStatus(matchId, 'client', 'completed');
    const first = await pay(matchId);
    jest
      .spyOn(simulatedAdapter, 'checkStatus')
      .mockResolvedValue({ status: 'FAILED', failureReason: 'NOT_ENOUGH_FUNDS', raw: { simulated: true } });
    await paymentService.refreshPending();
    jest.restoreAllMocks();

    const clientTold = (await noticesFor('client', 'Payment did not go through')).filter((n) => n.body.includes(title));
    expect(clientTold).toHaveLength(1);
    expect(clientTold[0].body).toContain('NOT_ENOUGH_FUNDS');
    expect((await noticesFor('worker', 'Payment not completed')).some((n) => n.body.includes(title))).toBe(true);

    const retry = await pay(matchId);
    expect(retry.status).toBe(201);
    const tx = must(await db.Transaction.findByPk(retry.body.id), 'transaction');
    expect(tx.status).toBe('initiated');
    expect(tx.previousAttempts).toHaveLength(1);
    expect(tx.previousAttempts?.[0]).toMatchObject({
      providerReference: first.body.providerReference,
      failureReason: 'NOT_ENOUGH_FUNDS',
    });
  });
});

describe('reviews wait for the money', () => {
  test('a job marked done but not paid cannot be reviewed; once paid it can', async () => {
    const { matchId } = await jobInProgress();
    await setStatus(matchId, 'client', 'completed');
    const early = await request(app).post('/api/reviews').set(as('client')).send({ matchId, rating: 5 });
    expect(early.status).toBe(409);

    const requested = await pay(matchId);
    await paymentService.confirm(requested.body.id);
    const review = await request(app).post('/api/reviews').set(as('client')).send({ matchId, rating: 5 });
    expect(review.status).toBe(201);
  });
});
