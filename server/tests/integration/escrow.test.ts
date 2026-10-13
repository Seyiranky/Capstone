import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as escrowService from '../../src/services/escrowService';
import { AUTO_RELEASE_AFTER_MS, MAX_CODE_ATTEMPTS } from '../../src/services/escrowRules';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `escrow-worker-${stamp}@example.com`,
  client: `escrow-client-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};

const as = (who: 'worker' | 'client') => ({ Authorization: `Bearer ${tokens[who]}` });

/** A gig with a pending invitation, accepted by the worker through the API. */
const acceptedMatch = async (budget = 20000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Escrow fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  const res = await request(app)
    .put(`/api/matches/${match.id}/status`)
    .set(as('worker'))
    .send({ status: 'accepted' });
  expect(res.status).toBe(200);
  return { gig, matchId: match.id };
};

const transactionFor = async (matchId: string) =>
  must(await db.Transaction.findOne({ where: { matchId } }), 'transaction');

const codeFor = async (matchId: string) =>
  must((await db.Match.scope('withCompletionCode').findByPk(matchId))?.completionCode, 'code');

const fundEscrow = async (matchId: string) => {
  const tx = await transactionFor(matchId);
  const res = await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
  expect(res.status).toBe(200);
  return res.body;
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({
    name: 'Escrow Worker', email: emails.worker, passwordHash, role: 'worker',
  });
  users.client = await db.User.create({
    name: 'Escrow Client', email: emails.client, passwordHash, role: 'client',
  });
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('funding on acceptance', () => {
  test('accepting opens a payment request for the budget and issues a 4-digit code', async () => {
    const { matchId } = await acceptedMatch(18000);
    const tx = await transactionFor(matchId);
    expect(tx.status).toBe('initiated');
    expect(Number(tx.amount)).toBe(18000);
    expect(tx.escrowStatus).toBe('none');
    expect(await codeFor(matchId)).toMatch(/^\d{4}$/);
  });

  test('once collected, the money is held, not paid, and the worker is told so', async () => {
    const { gig, matchId } = await acceptedMatch();
    const funded = await fundEscrow(matchId);
    expect(funded.status).toBe('confirmed');
    expect(funded.escrowStatus).toBe('held');
    expect(funded.heldAt).toBeTruthy();

    const notice = await db.Notification.findOne({
      where: { userId: users.worker.id, title: 'Payment secured' },
      order: [['createdAt', 'DESC']],
    });
    expect(notice?.body).toContain(gig.title);
  });

  test('held money is not income on the statement', async () => {
    const before = await request(app).get('/api/users/me/income-statement').set(as('worker'));
    const { matchId } = await acceptedMatch(7000);
    await fundEscrow(matchId);
    const after = await request(app).get('/api/users/me/income-statement').set(as('worker'));
    expect(after.body.summary.totalEarned).toBe(before.body.summary.totalEarned);
  });
});

describe('who can see and use the completion code', () => {
  test('the client sees the code for a job in progress; the worker never does', async () => {
    const { matchId } = await acceptedMatch();
    const code = await codeFor(matchId);

    const client = await request(app).get('/api/matches').set(as('client'));
    expect(client.body.find((m: { id: string }) => m.id === matchId).completionCode).toBe(code);

    const worker = await request(app).get('/api/matches').set(as('worker'));
    expect(worker.body.find((m: { id: string }) => m.id === matchId).completionCode).toBeUndefined();
  });

  test('the worker cannot complete the job directly and release the money themselves', async () => {
    const { matchId } = await acceptedMatch();
    const res = await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set(as('worker'))
      .send({ status: 'completed' });
    expect(res.status).toBe(403);
  });

  test('only the worker on the job can enter a code', async () => {
    const { matchId } = await acceptedMatch();
    const res = await request(app)
      .post(`/api/matches/${matchId}/complete`)
      .set(as('client'))
      .send({ code: await codeFor(matchId) });
    expect(res.status).toBe(403);
  });
});

describe('completing with the code', () => {
  test('a wrong code is refused and counted', async () => {
    const { matchId } = await acceptedMatch();
    const code = await codeFor(matchId);
    const wrong = code === '0000' ? '1111' : '0000';
    const res = await request(app)
      .post(`/api/matches/${matchId}/complete`)
      .set(as('worker'))
      .send({ code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.attemptsLeft).toBe(MAX_CODE_ATTEMPTS - 1);
  });

  test('the right code completes the job and releases held money in one step', async () => {
    const { gig, matchId } = await acceptedMatch();
    await fundEscrow(matchId);

    const res = await request(app)
      .post(`/api/matches/${matchId}/complete`)
      .set(as('worker'))
      .send({ code: await codeFor(matchId) });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completedVia).toBe('code');
    expect(res.body.transaction.escrowStatus).toBe('released');
    expect((await db.Gig.findByPk(gig.id))?.status).toBe('completed');
  });

  test(`after ${MAX_CODE_ATTEMPTS} wrong tries even the right code no longer works`, async () => {
    const { matchId } = await acceptedMatch();
    const code = await codeFor(matchId);
    const wrong = code === '0000' ? '1111' : '0000';
    let last;
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      last = await request(app)
        .post(`/api/matches/${matchId}/complete`)
        .set(as('worker'))
        .send({ code: wrong });
    }
    expect(last?.status).toBe(423);

    const right = await request(app)
      .post(`/api/matches/${matchId}/complete`)
      .set(as('worker'))
      .send({ code });
    expect(right.status).toBe(423);
    expect((await db.Match.findByPk(matchId))?.status).toBe('accepted');
  });
});

describe('the other routes money can take', () => {
  test('the client releasing from the app completes the job and pays the worker', async () => {
    const { matchId } = await acceptedMatch();
    await fundEscrow(matchId);
    const res = await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set(as('client'))
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.completedVia).toBe('client');
    expect(res.body.transaction.escrowStatus).toBe('released');
  });

  test('calling the job off after acceptance returns held money to the client', async () => {
    const { matchId } = await acceptedMatch();
    await fundEscrow(matchId);
    const res = await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set(as('worker'))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    const tx = await transactionFor(matchId);
    expect(tx.escrowStatus).toBe('refunded');
    expect(tx.refundedAt).toBeTruthy();
  });

  test('money collected after the job was completed goes straight to the worker', async () => {
    const { matchId } = await acceptedMatch();
    await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set(as('client'))
      .send({ status: 'completed' });
    expect((await transactionFor(matchId)).escrowStatus).toBe('none');

    const funded = await fundEscrow(matchId);
    expect(funded.escrowStatus).toBe('released');
  });
});

describe('automatic release', () => {
  test('nothing releases before the worker reports the job done', async () => {
    const { matchId } = await acceptedMatch();
    await fundEscrow(matchId);
    const far = new Date(Date.now() + 10 * AUTO_RELEASE_AFTER_MS);
    await escrowService.releaseDue(undefined, far);
    expect((await db.Match.findByPk(matchId))?.status).toBe('accepted');
  });

  test('72 hours after "work done" the money releases on its own, once', async () => {
    const { matchId } = await acceptedMatch();
    await fundEscrow(matchId);
    const done = await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'));
    expect(done.status).toBe(200);
    expect(done.body.workDoneAt).toBeTruthy();

    const early = new Date(Date.now() + AUTO_RELEASE_AFTER_MS - 60_000);
    await escrowService.releaseDue(undefined, early);
    expect((await db.Match.findByPk(matchId))?.status).toBe('accepted');

    const late = new Date(Date.now() + AUTO_RELEASE_AFTER_MS + 60_000);
    await escrowService.releaseDue(undefined, late);
    const match = must(await db.Match.findByPk(matchId), 'match');
    expect(match.status).toBe('completed');
    expect(match.completedVia).toBe('auto');
    expect((await transactionFor(matchId)).escrowStatus).toBe('released');

    // A second sweep finds nothing left to do for this job.
    const releasedNotices = async () =>
      db.Notification.count({ where: { userId: users.worker.id, title: 'Payment released' } });
    const before = await releasedNotices();
    await escrowService.releaseDue(undefined, late);
    expect(await releasedNotices()).toBe(before);
  });
});
