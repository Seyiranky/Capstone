import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import { jwtSecret } from '../../src/config/env';

const stamp = Date.now();
const emails = { admin: `sms-health-admin-${stamp}@example.com`, worker: `sms-health-worker-${stamp}@example.com` };
let adminToken: string;
let workerToken: string;
let notificationId: string;

const tokenFor = (user: { id: string; role: string }) =>
  jwt.sign({ id: user.id, role: user.role }, jwtSecret());

beforeAll(async () => {
  const admin = await db.User.create({ name: 'Health Admin', email: emails.admin, passwordHash: 'x', role: 'admin' });
  const worker = await db.User.create({ name: 'Health Worker', email: emails.worker, passwordHash: 'x', role: 'worker' });
  adminToken = tokenFor(admin);
  workerToken = tokenFor(worker);
  notificationId = (await db.Notification.create({ userId: worker.id, title: 't', body: 'b' })).id;
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const get = (token: string) => request(app).get('/api/admin/sms-health').set('Authorization', `Bearer ${token}`);

describe('admin SMS health', () => {
  test('is for admins only', async () => {
    await request(app).get('/api/admin/sms-health').expect(401);
    await get(workerToken).expect(403);
  });

  test('counts outcomes, cost and unreported messages', async () => {
    const before = (await get(adminToken).expect(200)).body;

    const old = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await db.NotificationDelivery.bulkCreate([
      { notificationId, channel: 'sms', status: 'delivered', provider: 'pindo', segments: 1, cost: 0.01 },
      { notificationId, channel: 'sms', status: 'failed', provider: 'pindo', segments: 1, cost: 0.01 },
      { notificationId, channel: 'sms', status: 'sent', provider: 'pindo', segments: 2, cost: 0.02, sentAt: old },
      { notificationId, channel: 'email', status: 'sent', provider: 'log' },
    ]);

    const after = (await get(adminToken).expect(200)).body;

    expect(after.counts.delivered - before.counts.delivered).toBe(1);
    expect(after.counts.failed - before.counts.failed).toBe(1);
    expect(after.counts.sent - before.counts.sent).toBe(1);
    expect(after.noReportAfter24h - before.noReportAfter24h).toBe(1);
    expect(after.cost - before.cost).toBeCloseTo(0.04, 4);
    expect(after.driver).toBe('log');
  });
});
