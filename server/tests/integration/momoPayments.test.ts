import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { CLIENT_MOMO } from '../helpers/payment';
import * as mtn from '../../src/services/payments/mtnMomoAdapter';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `momo-worker-${stamp}@example.com`,
  client: `momo-client-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

const jobInProgress = async (budget = 20000) => {
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId, title: `MoMo job ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  return match.id;
};
const markDone = (matchId: string) =>
  request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
const pay = (matchId: string, body: Record<string, unknown> = {}, who = 'client') =>
  request(app).post('/api/transactions/pay').set(as(who)).send({ matchId, phone: CLIENT_MOMO, ...body });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  skillId = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill').id;
  users.worker = await db.User.create({
    name: 'MoMo Worker', email: emails.worker, passwordHash, role: 'worker',
    phone: `+25079${String(stamp).slice(-7)}`, phoneVerifiedAt: new Date(),
  });
  users.client = await db.User.create({ name: 'MoMo Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('paying for a finished job with Mobile Money', () => {
  test('nothing is collected when the worker accepts', async () => {
    const matchId = await jobInProgress();
    expect(await db.Transaction.findOne({ where: { matchId } })).toBeNull();
  });

  test('the job must be done, the client must pay, and the number must be a Rwandan mobile number', async () => {
    const matchId = await jobInProgress();
    expect((await pay(matchId)).status).toBe(409);
    await markDone(matchId);
    expect((await pay(matchId, {}, 'worker')).status).toBe(403);
    expect((await pay(matchId, { phone: '12345' })).status).toBe(400);
  });

  test('the request waits for the client to approve on their phone, then pays the worker with a receipt', async () => {
    const matchId = await jobInProgress(20000);
    await markDone(matchId);
    const requested = await pay(matchId);
    expect(requested.status).toBe(201);
    expect(requested.body).toMatchObject({ status: 'initiated', payerMsisdn: '+250788123456' });
    // Not approved yet: asking again returns the same request, not a second prompt.
    expect((await pay(matchId)).body.id).toBe(requested.body.id);
    expect((await request(app).get(`/api/transactions/${requested.body.id}`).set(as('client'))).body.status).toBe('initiated');

    const approved = await request(app).post(`/api/transactions/${requested.body.id}/confirm`).set(as('client'));
    expect(approved.body.status).toBe('confirmed');
    expect(approved.body.receiptNumber).toMatch(/^ISK-/);
    const payout = must(await db.Payout.findOne({ where: { matchId } }), 'payout');
    expect(Number(payout.amount)).toBe(20000);
    expect((await pay(matchId)).status).toBe(409);
  });

  test('a failed payment can be tried again', async () => {
    const matchId = await jobInProgress();
    await markDone(matchId);
    const first = await pay(matchId);
    await request(app).post(`/api/transactions/${first.body.id}/fail`).set(as('client')).send({ reason: 'Not approved' });
    const again = await pay(matchId);
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('initiated');
    expect(again.body.providerReference).not.toBe(first.body.providerReference);
  });
});

describe('money paid in advance under the old escrow flow', () => {
  const heldPayment = async (matchId: string, amount: number) =>
    db.Transaction.create({
      matchId, amount, status: 'confirmed', escrowStatus: 'held', heldAt: new Date(),
      provider: 'simulated-momo', reference: `MOMO-SIM-${Math.random().toString(36).slice(2)}`,
    });

  test('is paid out with a receipt when the job is marked done', async () => {
    const matchId = await jobInProgress(17000);
    await heldPayment(matchId, 17000);
    await markDone(matchId);
    const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
    expect(tx.escrowStatus).toBe('released');
    expect(tx.receiptNumber).toMatch(/^ISK-/);
    expect(Number(must(await db.Payout.findOne({ where: { matchId } }), 'payout').amount)).toBe(17000);
  });

  test('goes back to the client when the job is called off', async () => {
    const matchId = await jobInProgress(9000);
    await heldPayment(matchId, 9000);
    await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'cancelled' });
    expect(must(await db.Transaction.findOne({ where: { matchId } }), 'tx').escrowStatus).toBe('refunded');
  });
});

describe('the MTN MoMo adapter', () => {
  const ENV = {
    PAYMENT_PROVIDER: 'mtn-momo',
    MOMO_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
    MOMO_TARGET_ENV: 'sandbox',
    MOMO_COLLECTION_KEY: 'coll-sub-key',
    MOMO_COLLECTION_USER: 'coll-user',
    MOMO_COLLECTION_API_KEY: 'coll-api-key',
    MOMO_DISBURSEMENT_KEY: 'disb-sub-key',
    MOMO_DISBURSEMENT_USER: 'disb-user',
    MOMO_DISBURSEMENT_API_KEY: 'disb-api-key',
  };
  let mtnStatus = 'PENDING';
  const calls: { url: string; init: RequestInit }[] = [];
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    Object.assign(process.env, ENV);
    mtn.resetTokens();
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      if (url.endsWith('/token/')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      if (url.endsWith('/collection/v1_0/requesttopay')) return new Response(null, { status: 202 });
      if (url.includes('/collection/v1_0/requesttopay/')) return new Response(JSON.stringify({ status: mtnStatus }), { status: 200 });
      if (url.endsWith('/disbursement/v1_0/transfer')) return new Response(null, { status: 202 });
      return new Response('not found', { status: 404 });
    });
  });

  afterAll(() => {
    fetchSpy.mockRestore();
    for (const key of Object.keys(ENV)) delete process.env[key];
  });

  test('requests payment the way MTN expects', async () => {
    const matchId = await jobInProgress(15000);
    await markDone(matchId);
    const res = await pay(matchId);
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('mtn-momo');

    const token = must(calls.find((c) => c.url.endsWith('/collection/token/')), 'token call');
    const tokenHeaders = token.init.headers as Record<string, string>;
    expect(tokenHeaders.Authorization).toBe(`Basic ${Buffer.from('coll-user:coll-api-key').toString('base64')}`);
    expect(tokenHeaders['Ocp-Apim-Subscription-Key']).toBe('coll-sub-key');

    const req = must(calls.find((c) => c.url.endsWith('/requesttopay')), 'request to pay');
    const headers = req.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-Target-Environment']).toBe('sandbox');
    expect(headers['X-Reference-Id']).toBe(res.body.providerReference);
    const body = JSON.parse(String(req.init.body));
    expect(body).toMatchObject({
      amount: '15000',
      currency: 'EUR',
      externalId: res.body.reference,
      payer: { partyIdType: 'MSISDN', partyId: '250788123456' },
    });
  });

  test('settles when MTN says SUCCESSFUL, and sends the worker their share', async () => {
    const matchId = await jobInProgress(12000);
    await markDone(matchId);
    const requested = await pay(matchId);
    mtnStatus = 'PENDING';
    expect((await request(app).get(`/api/transactions/${requested.body.id}`).set(as('client'))).body.status).toBe('initiated');
    mtnStatus = 'SUCCESSFUL';
    const settled = await request(app).get(`/api/transactions/${requested.body.id}`).set(as('client'));
    expect(settled.body.status).toBe('confirmed');

    const payout = must(await db.Payout.findOne({ where: { matchId } }), 'payout');
    expect(payout.transferStatus).toBe('sent');
    const transfer = must(calls.find((c) => c.url.endsWith('/disbursement/v1_0/transfer')), 'transfer');
    expect(JSON.parse(String(transfer.init.body))).toMatchObject({
      amount: '12000',
      payee: { partyIdType: 'MSISDN', partyId: users.worker.phone!.replace('+', '') },
    });
  });

  test('a callback is not trusted: the status is read from MTN', async () => {
    const matchId = await jobInProgress();
    await markDone(matchId);
    const requested = await pay(matchId);
    mtnStatus = 'PENDING';
    const forged = await request(app).post('/api/webhooks/momo').send({ externalId: requested.body.reference, status: 'SUCCESSFUL' });
    expect(forged.status).toBe(200);
    expect(must(await db.Transaction.findByPk(requested.body.id), 'tx').status).toBe('initiated');

    mtnStatus = 'FAILED';
    await request(app).post('/api/webhooks/momo').send({ externalId: requested.body.reference });
    expect(must(await db.Transaction.findByPk(requested.body.id), 'tx').status).toBe('failed');
  });

  test('a real payment cannot be "confirmed" by the app; only the payer approves it', async () => {
    const matchId = await jobInProgress();
    await markDone(matchId);
    const requested = await pay(matchId);
    expect((await request(app).post(`/api/transactions/${requested.body.id}/confirm`).set(as('client'))).status).toBe(409);
  });

  test('statuses map onto the platform’s three', () => {
    expect(mtn.normaliseStatus('SUCCESSFUL')).toBe('confirmed');
    expect(mtn.normaliseStatus('FAILED')).toBe('failed');
    expect(mtn.normaliseStatus('PENDING')).toBe('initiated');
  });
});
