const db = require('../../models');
const paymentService = require('../../services/paymentService');

let skill;
let client;
let worker;
let gig;
let match;

beforeAll(async () => {
  skill = await db.Skill.findOne({ where: { category: 'digital_web' } });
  client = await db.User.create({
    name: 'Test Client',
    email: `payment-client-${Date.now()}@example.com`,
    passwordHash: 'x',
    role: 'client',
  });
  worker = await db.User.create({
    name: 'Test Worker',
    email: `payment-worker-${Date.now()}@example.com`,
    passwordHash: 'x',
    role: 'worker',
  });
  gig = await db.Gig.create({
    clientId: client.id,
    skillId: skill.id,
    title: 'Test gig',
    description: 'Test description',
    budget: 12000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'matched',
  });
  match = await db.Match.create({ gigId: gig.id, workerId: worker.id, status: 'accepted' });
});

afterAll(async () => {
  await db.User.destroy({ where: { id: [client.id, worker.id] } });
  await db.sequelize.close();
});

describe('paymentService.initiate', () => {
  test('creates a transaction with status initiated and a unique reference', async () => {
    const transaction = await paymentService.initiate(match, gig.budget);

    expect(transaction.matchId).toBe(match.id);
    expect(Number(transaction.amount)).toBe(Number(gig.budget));
    expect(transaction.status).toBe('initiated');
    expect(transaction.provider).toBe('simulated-momo');
    expect(transaction.reference).toMatch(/^MOMO-SIM-/);

    await transaction.destroy();
  });
});

describe('paymentService.confirm', () => {
  test('transitions an initiated transaction to confirmed', async () => {
    const transaction = await paymentService.initiate(match, gig.budget);

    const confirmed = await paymentService.confirm(transaction.id);

    expect(confirmed.status).toBe('confirmed');
    await transaction.destroy();
  });

  test('throws a 409 when confirming a non-initiated transaction', async () => {
    const transaction = await paymentService.initiate(match, gig.budget);
    await paymentService.confirm(transaction.id);

    await expect(paymentService.confirm(transaction.id)).rejects.toMatchObject({ status: 409 });

    await transaction.destroy();
  });

  test('throws a 404 for a transaction that does not exist', async () => {
    await expect(paymentService.confirm('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('paymentService.fail', () => {
  test('transitions a transaction to failed', async () => {
    const transaction = await paymentService.initiate(match, gig.budget);

    const failed = await paymentService.fail(transaction.id);

    expect(failed.status).toBe('failed');
    await transaction.destroy();
  });
});
