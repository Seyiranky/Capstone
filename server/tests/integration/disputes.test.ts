import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import * as escrowService from '../../src/services/escrowService';
import * as disputeService from '../../src/services/disputeService';
import { AUTO_RELEASE_AFTER_MS } from '../../src/services/escrowRules';
import { jwtSecret } from '../../src/config/env';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `dispute-worker-${stamp}@example.com`,
  client: `dispute-client-${stamp}@example.com`,
  admin: `dispute-admin-${stamp}@example.com`,
  outsider: `dispute-outsider-${stamp}@example.com`,
  m1: `dispute-m1-${stamp}@example.com`,
  m2: `dispute-m2-${stamp}@example.com`,
  m3: `dispute-m3-${stamp}@example.com`,
  tied: `dispute-tied-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};

/** A token for any user: the panel is a seeded draw, so the test votes as whoever sits on it. */
const tokenFor = (user: { id: string; role: string }) =>
  jwt.sign({ id: user.id, role: user.role }, jwtSecret(), { expiresIn: '1h' });
const as = (who: string) => ({ Authorization: `Bearer ${tokenFor(users[who])}` });
const asId = async (id: string) => {
  const user = must(await db.User.findByPk(id), 'mediator');
  return { Authorization: `Bearer ${tokenFor(user)}` };
};

/** A job accepted by the worker with the client's money held in escrow. */
const heldJob = async (budget = 40000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Dispute fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  const tx = must(await db.Transaction.findOne({ where: { matchId: match.id } }), 'tx');
  await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
  return { gig, matchId: match.id };
};

const openDispute = (matchId: string, who = 'client') =>
  request(app)
    .post('/api/disputes')
    .set(as(who))
    .send({ matchId, reason: 'poorQuality', details: 'The curtains were the wrong length.' });

const panelOf = async (disputeId: string) =>
  (await db.DisputeVote.findAll({ where: { disputeId } })).map((v) => v.mediatorId);

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  const make = (key: string, role: 'worker' | 'client' | 'admin', extra = {}) =>
    db.User.create({ name: `Dispute ${key}`, email: emails[key], passwordHash, role, ...extra });
  users.worker = await make('worker', 'worker');
  users.client = await make('client', 'client');
  users.admin = await make('admin', 'admin');
  users.outsider = await make('outsider', 'worker');
  // Well rated with a record: eligible to mediate.
  for (const key of ['m1', 'm2', 'm3']) {
    users[key] = await make(key, 'worker', { trustScore: 4.4, reviewCount: 6 });
  }
  // Just as well rated, but has worked for this client before.
  users.tied = await make('tied', 'worker', { trustScore: 4.6, reviewCount: 9 });
  const pastGig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: 'An earlier job',
    description: 'Fixture',
    budget: 5000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'completed',
  });
  await db.Match.create({ gigId: pastGig.id, workerId: users.tied.id, status: 'completed' });
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('opening a dispute', () => {
  test('nothing can be disputed before the money is in escrow', async () => {
    const gig = await db.Gig.create({
      clientId: users.client.id, skillId: skill.id, title: 'Unfunded', description: 'Fixture',
      budget: 1000, locationLat: -1.95, locationLng: 30.06, status: 'open',
    });
    const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
    await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
    const res = await openDispute(match.id);
    expect(res.status).toBe(409);
  });

  test('only the two parties can open one', async () => {
    const { matchId } = await heldJob();
    expect((await openDispute(matchId, 'outsider')).status).toBe(403);
  });

  test('the panel is three eligible peers: never a party, never someone tied to one', async () => {
    const pool = await disputeService.eligibleMediators(users.worker.id, users.client.id);
    expect(pool).toEqual(expect.arrayContaining([users.m1.id, users.m2.id, users.m3.id]));
    expect(pool).not.toContain(users.tied.id);
    expect(pool).not.toContain(users.worker.id);
    expect(pool).not.toContain(users.client.id);

    const { matchId } = await heldJob();
    const res = await openDispute(matchId);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body.panelSeed).toBeTruthy();
    const panel = await panelOf(res.body.id);
    expect(panel).toHaveLength(3);
    for (const id of panel) expect(pool).toContain(id);
  });

  test('a second dispute on the same job is refused', async () => {
    const { matchId } = await heldJob();
    await openDispute(matchId);
    expect((await openDispute(matchId, 'worker')).status).toBe(409);
  });
});

describe('a dispute freezes the money', () => {
  test('the completion code stops working', async () => {
    const { matchId } = await heldJob();
    await openDispute(matchId);
    const code = must((await db.Match.scope('withCompletionCode').findByPk(matchId))?.completionCode, 'code');
    const res = await request(app).post(`/api/matches/${matchId}/complete`).set(as('worker')).send({ code });
    expect(res.status).toBe(409);
  });

  test('the 72-hour release skips it', async () => {
    const { matchId } = await heldJob();
    await request(app).post(`/api/matches/${matchId}/work-done`).set(as('worker'));
    await openDispute(matchId, 'worker');
    await escrowService.releaseDue(undefined, new Date(Date.now() + 2 * AUTO_RELEASE_AFTER_MS));
    expect(must(await db.Match.findByPk(matchId), 'match').status).toBe('accepted');
  });

  test('the client can still pay out, which settles the dispute', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId, 'worker');
    await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
    const dispute = must(await db.Dispute.findByPk(opened.body.id), 'dispute');
    expect(dispute.status).toBe('settled');
    expect(dispute.outcome).toBe('release');
    expect(dispute.decidedBy).toBe('parties');
  });
});

describe('both sides are heard, and votes stay private until the end', () => {
  test('the other party can respond once; the opener cannot', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const id = opened.body.id;
    const body = { response: 'They were cut to the measurements I was given.' };
    expect((await request(app).post(`/api/disputes/${id}/response`).set(as('client')).send(body)).status).toBe(403);
    expect((await request(app).post(`/api/disputes/${id}/response`).set(as('worker')).send(body)).status).toBe(200);
    expect((await request(app).post(`/api/disputes/${id}/response`).set(as('worker')).send(body)).status).toBe(409);
  });

  test("a party sees that mediators voted, not how, and not who they are", async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const [first] = await panelOf(opened.body.id);
    await request(app)
      .post(`/api/disputes/${opened.body.id}/votes`)
      .set(await asId(first))
      .send({ outcome: 'refund', rationale: 'Photos show the wrong length.' });

    const list = await request(app).get('/api/disputes').set(as('worker'));
    const seen = list.body.find((d: { id: string }) => d.id === opened.body.id);
    expect(seen.votes.filter((v: { voted: boolean }) => v.voted)).toHaveLength(1);
    for (const v of seen.votes) {
      expect(v.vote).toBeNull();
      expect(v.mediator).toBeNull();
    }
  });
});

describe('deciding', () => {
  test('two matching votes decide it: a refund returns the money and calls the job off', async () => {
    const { gig, matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const [a, b, c] = await panelOf(opened.body.id);
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(a)).send({ outcome: 'refund' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(b)).send({ outcome: 'refund' });

    const dispute = must(await db.Dispute.findByPk(opened.body.id), 'dispute');
    expect(dispute.status).toBe('decided');
    expect(dispute.outcome).toBe('refund');
    expect(dispute.decidedBy).toBe('mediators');
    expect(must(await db.Transaction.findOne({ where: { matchId } }), 'tx').escrowStatus).toBe('refunded');
    expect(must(await db.Match.findByPk(matchId), 'match').status).toBe('cancelled');
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('cancelled');

    // The third seat can no longer vote.
    const late = await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(c)).send({ outcome: 'release' });
    expect(late.status).toBe(409);
  });

  test('a split pays the worker half, and only half counts as their income', async () => {
    const before = await request(app).get('/api/users/me/income-statement').set(as('worker'));
    const { matchId } = await heldJob(50000);
    const opened = await openDispute(matchId);
    const [a, b] = await panelOf(opened.body.id);
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(a)).send({ outcome: 'split' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(b)).send({ outcome: 'split' });

    const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
    expect(tx.escrowStatus).toBe('released');
    expect(Number(tx.releasedAmount)).toBe(25000);
    expect(must(await db.Match.findByPk(matchId), 'match').completedVia).toBe('dispute');

    const receipt = await request(app).get(`/api/receipts/${tx.receiptNumber}`);
    expect(receipt.body.amount).toBe(25000);
    const after = await request(app).get('/api/users/me/income-statement').set(as('worker'));
    expect(after.body.summary.totalEarned - before.body.summary.totalEarned).toBe(25000);
  });

  test('mediators who sided with the outcome are recorded as such', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const [a, b, c] = await panelOf(opened.body.id);
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(a)).send({ outcome: 'release' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(c)).send({ outcome: 'refund' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(b)).send({ outcome: 'release' });
    const votes = await db.DisputeVote.findAll({ where: { disputeId: opened.body.id } });
    const byId = new Map(votes.map((v) => [v.mediatorId, v.withMajority]));
    expect(byId.get(a)).toBe(true);
    expect(byId.get(b)).toBe(true);
    expect(byId.get(c)).toBe(false);
  });

  test('three different votes go to an admin, who must say why', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const [a, b, c] = await panelOf(opened.body.id);
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(a)).send({ outcome: 'release' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(b)).send({ outcome: 'refund' });
    await request(app).post(`/api/disputes/${opened.body.id}/votes`).set(await asId(c)).send({ outcome: 'split' });
    expect(must(await db.Dispute.findByPk(opened.body.id), 'dispute').status).toBe('escalated');

    const noReason = await request(app)
      .post(`/api/disputes/${opened.body.id}/resolve`)
      .set(as('admin'))
      .send({ outcome: 'release' });
    expect(noReason.status).toBe(400);

    const resolved = await request(app)
      .post(`/api/disputes/${opened.body.id}/resolve`)
      .set(as('admin'))
      .send({ outcome: 'release', note: 'Work matches the brief in the photos.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.decidedBy).toBe('admin');
    expect(must(await db.Transaction.findOne({ where: { matchId } }), 'tx').escrowStatus).toBe('released');
  });

  test('a dispute the panel has not decided in 5 days goes to an admin', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    await disputeService.escalateOverdue(undefined, new Date(Date.now() + disputeService.DECIDE_WITHIN_MS + 60_000));
    expect(must(await db.Dispute.findByPk(opened.body.id), 'dispute').status).toBe('escalated');
  });

  test('only admins can resolve', async () => {
    const { matchId } = await heldJob();
    const opened = await openDispute(matchId);
    const res = await request(app)
      .post(`/api/disputes/${opened.body.id}/resolve`)
      .set(as('client'))
      .send({ outcome: 'refund', note: 'I want my money back' });
    expect(res.status).toBe(403);
  });
});
