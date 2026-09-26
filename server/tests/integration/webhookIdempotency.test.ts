import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as paymentService from '../../src/services/paymentService';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `wh-worker-${stamp}@example.com`,
  client: `wh-client-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};

const login = async (email: string) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};

/** A completed match with a payment already requested. */
const paidMatch = async () => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Webhook fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget: 12000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'completed',
  });
  const match = await db.Match.create({
    gigId: gig.id,
    workerId: users.worker.id,
    status: 'completed',
    acceptedAt: new Date(),
  });
  const transaction = await paymentService.initiate(match, gig.budget);
  return { match, transaction };
};

const callback = (transaction: any, body = {}) =>
  request(app)
    .post(`/api/webhooks/payments/${transaction.provider}`)
    .send({
      providerReference: transaction.providerReference,
      status: 'SUCCESSFUL',
      ...body,
    });

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);

  users.worker = await db.User.create({
    name: 'Webhook Worker', email: emails.worker, passwordHash, role: 'worker',
  });
  users.client = await db.User.create({
    name: 'Webhook Client', email: emails.client, passwordHash, role: 'client',
  });
  for (const key of Object.keys(emails)) {
    tokens[key] = await login(emails[key]);
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('payment initiation through the adapter', () => {
  test('a transaction records the provider reference for independent audit', async () => {
    const { transaction } = await paidMatch();

    expect(transaction.provider).toBe('simulated-momo');
    // Unchanged from the original implementation, so existing records and the
    // reports built on them stay valid.
    expect(transaction.reference).toMatch(/^MOMO-SIM-/);
    expect(transaction.providerReference).toBe(transaction.reference);
    expect(transaction.currency).toBe('RWF');
    // A real gateway answers "pending" and confirms by callback, so the
    // simulated one does too rather than succeeding on the spot.
    expect(transaction.status).toBe('initiated');
    expect(transaction.providerStatus).toBe('PENDING');
  });
});

describe('a repeated callback settles a payment once', () => {
  test('the first callback confirms it', async () => {
    const { transaction } = await paidMatch();
    const res = await callback(transaction);

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.status).toBe('confirmed');
  });

  test('an identical callback is acknowledged but changes nothing', async () => {
    const { transaction } = await paidMatch();
    await callback(transaction);
    const second = await callback(transaction);

    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.applied).toBe(false);

    const rows = await db.Transaction.findAll({ where: { matchId: transaction.matchId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');
  });

  test('a retried callback does not tell the worker twice that they were paid', async () => {
    const { match, transaction } = await paidMatch();
    const gig = must(await db.Gig.findByPk(match.gigId), 'gig');

    await callback(transaction);
    await callback(transaction);
    await callback(transaction);

    // Scoped to this gig: the same worker legitimately has notifications from
    // the other fixtures in this file.
    const notifications = await db.Notification.findAll({
      where: { userId: match.workerId, title: 'Payment confirmed' },
    });
    const forThisGig = notifications.filter((n) => n.body.includes(gig.title));
    expect(forThisGig).toHaveLength(1);
  });

  test('simultaneous callbacks cannot both apply', async () => {
    const { transaction } = await paidMatch();
    const results = await Promise.all([
      callback(transaction),
      callback(transaction),
      callback(transaction),
    ]);

    // Exactly one settles; the rest are duplicates or are told to retry.
    const applied = results.filter((r) => r.body.applied === true);
    expect(applied).toHaveLength(1);

    const row = must(await db.Transaction.findByPk(transaction.id), 'row');
    expect(row.status).toBe('confirmed');
  });

  test('a success arriving after a failure does not overwrite it', async () => {
    const { transaction } = await paidMatch();
    await callback(transaction, { status: 'FAILED', failureReason: 'insufficient balance' });
    const late = await callback(transaction, { status: 'SUCCESSFUL' });

    expect(late.status).toBe(200);
    expect(late.body.duplicate).toBe(true);

    const row = must(await db.Transaction.findByPk(transaction.id), 'row');
    expect(row.status).toBe('failed');
    expect(row.failureReason).toBe('insufficient balance');
  });
});

describe('webhook robustness', () => {
  test('an unknown reference is acknowledged rather than left to be retried forever', async () => {
    const res = await request(app)
      .post('/api/webhooks/payments/simulated-momo')
      .send({ providerReference: 'MOMO-SIM-does-not-exist', status: 'SUCCESSFUL' });

    // A provider cannot fix this by retrying, so holding their queue open with
    // a 4xx helps nobody.
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
    expect(res.body.reason).toBe('unknownTransaction');
  });

  test('a callback missing its fields is rejected', async () => {
    const res = await request(app).post('/api/webhooks/payments/simulated-momo').send({});
    expect(res.status).toBe(400);
  });

  test('an Idempotency-Key replays the first answer verbatim', async () => {
    const { transaction } = await paidMatch();
    const key = `key-${Math.random().toString(36).slice(2)}`;

    const first = await callback(transaction).set('Idempotency-Key', key);
    const replay = await request(app)
      .post(`/api/webhooks/payments/${transaction.provider}`)
      .set('Idempotency-Key', key)
      // Deliberately different body: the key decides, not the payload.
      .send({ providerReference: transaction.providerReference, status: 'FAILED' });

    expect(first.body.applied).toBe(true);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.status).toBe('confirmed');

    const row = must(await db.Transaction.findByPk(transaction.id), 'row');
    expect(row.status).toBe('confirmed');
  });
});

describe('failing a payment', () => {
  test('a party to the match can record a failure, which had no route at all before', async () => {
    const { transaction } = await paidMatch();
    const res = await request(app)
      .post(`/api/transactions/${transaction.id}/fail`)
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ reason: 'Payer cancelled the prompt' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.failureReason).toBe('Payer cancelled the prompt');
  });

  test('a stranger cannot fail someone else payment', async () => {
    const { transaction } = await paidMatch();
    const outsider = await db.User.create({
      name: 'Outsider',
      email: `wh-outsider-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'worker',
    });
    const token = (
      await request(app).post('/api/auth/login').send({ email: outsider.email, password })
    ).body.token;

    const res = await request(app)
      .post(`/api/transactions/${transaction.id}/fail`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'not mine' });

    expect(res.status).toBe(403);
    await outsider.destroy();
  });

  test('a settled payment cannot then be failed', async () => {
    const { transaction } = await paidMatch();
    await callback(transaction);

    const res = await request(app)
      .post(`/api/transactions/${transaction.id}/fail`)
      .set('Authorization', `Bearer ${tokens.worker}`)
      .send({ reason: 'too late' });

    expect(res.status).toBe(409);
  });
});
