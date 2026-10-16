import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import * as disputeService from '../../src/services/disputeService';
import { jwtSecret } from '../../src/config/env';
import { must } from '../helpers/fixtures';
import { CLIENT_MOMO, payForJob } from '../helpers/payment';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const emails: Record<string, string> = {
  worker: `stage-worker-${stamp}@example.com`,
  client: `stage-client-${stamp}@example.com`,
  admin: `stage-admin-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const token = (who: string) => jwt.sign({ id: users[who].id, role: users[who].role }, jwtSecret(), { expiresIn: '1h' });
const as = (who: string) => ({ Authorization: `Bearer ${token(who)}` });
let skillId = '';

/** A job the client has marked done, not yet paid. */
const doneJob = async (budget = 40000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId, title: `Stage fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('client')).send({ status: 'completed' });
  return match.id;
};

const open = (matchId: string, who: string, reason: string) =>
  request(app).post('/api/disputes').set(as(who)).send({ matchId, reason, details: 'Explained in a sentence or two here.' });

const decideAsAdmin = (id: string, outcome: string) =>
  request(app).post(`/api/disputes/${id}/resolve`).set(as('admin')).send({ outcome, note: 'Decided on the evidence.' });

beforeAll(async () => {
  skillId = must(await db.Skill.findOne({ where: { parentId: null } }), 'skill').id;
  const passwordHash = await bcrypt.hash('password123', 10);
  users.worker = await db.User.create({ name: 'Stage Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Stage Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Stage Admin', email: emails.admin, passwordHash, role: 'admin' });
});

afterAll(async () => {
  await db.SupportTicket.destroy({ where: { userId: [users.client.id, users.worker.id] } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('a job done but not paid', () => {
  test('the worker can dispute it for not being paid, and payment waits for the decision', async () => {
    const matchId = await doneJob();
    const elig = await request(app).get('/api/disputes/eligible').set(as('worker'));
    const row = elig.body.find((r: { matchId: string }) => r.matchId === matchId);
    expect(row).toMatchObject({ canOpen: true, stage: 'awaiting_payment', reasons: ['notPaid', 'other'] });

    const opened = await open(matchId, 'worker', 'notPaid');
    expect(opened.status).toBe(201);
    expect(opened.body.stage).toBe('awaiting_payment');

    const pay = await request(app).post('/api/transactions/pay').set(as('client')).send({ matchId, phone: CLIENT_MOMO });
    expect(pay.status).toBe(409);
  });

  test('split: the client then owes half, and pays half', async () => {
    const matchId = await doneJob(40000);
    const opened = await open(matchId, 'client', 'poorQuality');
    expect((await decideAsAdmin(opened.body.id, 'split')).status).toBe(200);
    expect(Number(must(await db.Match.findByPk(matchId), 'match').agreedAmount)).toBe(20000);
    const { pay } = await payForJob(matchId, as('client').Authorization.slice(7), { complete: false });
    expect(pay.status).toBe(201);
    expect(Number(pay.body.amount)).toBe(20000);
  });

  test('refund: the job is called off and nothing is owed', async () => {
    const matchId = await doneJob();
    const opened = await open(matchId, 'client', 'notDone');
    await decideAsAdmin(opened.body.id, 'refund');
    expect(must(await db.Match.findByPk(matchId), 'match').status).toBe('cancelled');
    const pay = await request(app).post('/api/transactions/pay').set(as('client')).send({ matchId, phone: CLIENT_MOMO });
    expect(pay.status).toBe(409);
  });
});

describe('a paid job', () => {
  test('can be disputed by the client, and a refund decision becomes a request for the team', async () => {
    const matchId = await doneJob(30000);
    await payForJob(matchId, as('client').Authorization.slice(7), { complete: false });
    const opened = await open(matchId, 'client', 'poorQuality');
    expect(opened.status).toBe(201);
    expect(opened.body.stage).toBe('paid');

    await decideAsAdmin(opened.body.id, 'refund');
    const dispute = must(await db.Dispute.findByPk(opened.body.id), 'dispute');
    expect(Number(dispute.refundDue)).toBe(30000);
    const ticket = must(await db.SupportTicket.findByPk(dispute.supportTicketId!), 'ticket');
    expect(ticket.userId).toBe(users.client.id);
    expect(ticket.priority).toBe('high');
    // The job itself stays done and paid.
    expect(must(await db.Match.findByPk(matchId), 'match').status).toBe('completed');
  });

  test('cannot be disputed once two weeks have passed', async () => {
    const matchId = await doneJob();
    await payForJob(matchId, as('client').Authorization.slice(7), { complete: false });
    await db.Match.update({ completedAt: new Date(Date.now() - 15 * 24 * 3600 * 1000) }, { where: { id: matchId } });
    expect((await open(matchId, 'client', 'poorQuality')).status).toBe(409);
  });

  test('one dispute per job: once decided, it cannot be opened again', async () => {
    const matchId = await doneJob();
    const opened = await open(matchId, 'worker', 'notPaid');
    await decideAsAdmin(opened.body.id, 'release');
    const match = must(await db.Match.findByPk(matchId, { include: [{ model: db.Gig, as: 'gig' }] }), 'match');
    expect(await disputeService.eligibility(match as never, users.client.id)).toMatchObject({ canOpen: false, blocked: 'already_disputed' });
  });
});
