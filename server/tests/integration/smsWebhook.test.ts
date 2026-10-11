import request from 'supertest';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const email = `sms-webhook-${stamp}@example.com`;
const SECRET = 'test-sms-secret';
let notificationId: string;

beforeAll(async () => {
  process.env.SMS_WEBHOOK_SECRET = SECRET;
  const user = await db.User.create({ name: 'Webhook Test', email, passwordHash: 'x', role: 'worker' });
  const notification = await db.Notification.create({ userId: user.id, title: 't', body: 'b' });
  notificationId = notification.id;
});

afterAll(async () => {
  delete process.env.SMS_WEBHOOK_SECRET;
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

const sentRow = (providerMessageId: string) =>
  db.NotificationDelivery.create({
    notificationId,
    channel: 'sms',
    status: 'sent',
    provider: 'pindo',
    providerMessageId,
    sentAt: new Date(),
    segments: 1,
    cost: 0.006,
  });

const report = (body: object, secret: string | null = SECRET) => {
  const call = request(app).post('/api/webhooks/sms/pindo').send(body);
  return secret === null ? call : call.set('X-Webhook-Secret', secret);
};

describe('Pindo delivery reports', () => {
  test('a missing or wrong secret is refused', async () => {
    await report({ sms_id: 'x', status: 'DELIVRD' }, null).expect(401);
    await report({ sms_id: 'x', status: 'DELIVRD' }, 'wrong').expect(401);
  });

  test('the secret may come in the query string instead', async () => {
    await request(app)
      .post(`/api/webhooks/sms/pindo?secret=${SECRET}`)
      .send({ sms_id: 'unknown', status: 'DELIVRD' })
      .expect(200);
  });

  test('a report without an id or status is a bad request', async () => {
    await report({ status: 'DELIVRD' }).expect(400);
  });

  test('DELIVRD marks the row delivered', async () => {
    const row = await sentRow(`dlr-ok-${stamp}`);
    await report({ sms_id: row.providerMessageId, status: 'DELIVRD', modified_at: '2026-10-11T09:04:31' }).expect(200);

    await row.reload();
    expect(row.status).toBe('delivered');
    expect(row.providerStatus).toBe('DELIVRD');
    expect(row.deliveredAt).toBeInstanceOf(Date);
    expect(row.cost).toBe(0.006);
  });

  test.each(['UNDELIV', 'REJECTED', 'EXPIRED'])('%s marks the row failed with the reason', async (status) => {
    const row = await sentRow(`dlr-${status}-${stamp}`);
    await report({ sms_id: row.providerMessageId, status }).expect(200);

    await row.reload();
    expect(row.status).toBe('failed');
    expect(row.error).toBe(`carrier: ${status}`);
  });

  test('ACCEPTED records the raw status but changes nothing else', async () => {
    const row = await sentRow(`dlr-accepted-${stamp}`);
    await report({ sms_id: row.providerMessageId, status: 'ACCEPTED' }).expect(200);

    await row.reload();
    expect(row.status).toBe('sent');
    expect(row.providerStatus).toBe('ACCEPTED');
  });

  test('a late ACCEPTED does not undo a delivery', async () => {
    const row = await sentRow(`dlr-late-${stamp}`);
    await report({ sms_id: row.providerMessageId, status: 'DELIVRD' }).expect(200);
    await report({ sms_id: row.providerMessageId, status: 'ACCEPTED' }).expect(200);

    await row.reload();
    expect(row.status).toBe('delivered');
    expect(row.providerStatus).toBe('DELIVRD');
  });

  test('an id this database never recorded is acknowledged and ignored', async () => {
    const response = await report({ sms_id: 'never-sent', status: 'DELIVRD' }).expect(200);
    expect(response.body.matched).toBe(false);
  });
});
