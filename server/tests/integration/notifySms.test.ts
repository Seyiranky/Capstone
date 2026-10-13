import request from 'supertest';
import jwt from 'jsonwebtoken';
import { jwtSecret } from '../../src/config/env';
import app from '../../src/app';
import notify from '../../src/lib/notify';
import db from '../../src/models';
import { waitForDeliveries } from '../helpers/fixtures';

const stamp = Date.now();
const emails = {
  verified: `notify-sms-ok-${stamp}@example.com`,
  unverified: `notify-sms-unverified-${stamp}@example.com`,
  noPhone: `notify-sms-nophone-${stamp}@example.com`,
  optedOut: `notify-sms-out-${stamp}@example.com`,
  badNumber: `notify-sms-bad-${stamp}@example.com`,
};

let logSpy: jest.SpyInstance;

const makeUser = (email: string, overrides: Record<string, unknown> = {}) =>
  db.User.create({ name: 'Notify SMS Test', email, passwordHash: 'x', role: 'worker', ...overrides });

beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(async () => {
  logSpy.mockRestore();
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const smsRowFor = async (userId: string) => {
  const notification = await notify(undefined, {
    userId,
    title: 'Payment confirmed',
    body: 'You received 25,000 RWF.',
    category: 'critical',
  });
  const [row] = await waitForDeliveries(() =>
    db.NotificationDelivery.findAll({ where: { notificationId: notification.id, channel: 'sms' } }),
  );
  return row;
};

describe('SMS delivery', () => {
  test('a confirmed, opted-in number is sent SMS and the row records it', async () => {
    const user = await makeUser(emails.verified, {
      preferredChannel: 'sms',
      phone: '+250788123456',
      phoneVerifiedAt: new Date(),
    });

    const row = await smsRowFor(user.id);

    expect(row.status).toBe('sent');
    expect(row.provider).toBe('log');
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.segments).toBe(1);
  });

  test('a long notice is sent as one segment that says it is from Isoko', async () => {
    const user = await db.User.findOne({ where: { email: emails.verified } });
    logSpy.mockClear();

    const notification = await notify(undefined, {
      userId: user!.id,
      title: 'Application approved',
      body: `Your application for “${'Repair a cracked laptop screen and replace the keyboard '.repeat(3)}” was approved. Confirm you're still available to take it.`,
      category: 'outcome',
    });
    const [row] = await waitForDeliveries(() =>
      db.NotificationDelivery.findAll({ where: { notificationId: notification.id, channel: 'sms' } }),
    );

    expect(row.segments).toBe(1);
    const line = logSpy.mock.calls.map((args) => String(args[0])).find((l) => l.startsWith('[sms:log]'));
    expect(line).toContain(': Isoko: Application approved. Your application for "Repair');
    expect(line).toMatch(/\.\.\.$/);
  });

  test('an unconfirmed number is skipped with its own reason', async () => {
    const user = await makeUser(emails.unverified, { preferredChannel: 'sms', phone: '+250788123456' });
    const row = await smsRowFor(user.id);
    expect(row.status).toBe('skipped');
    expect(row.error).toBe('phone not verified');
  });

  test('no number is skipped', async () => {
    const user = await makeUser(emails.noPhone, { preferredChannel: 'sms' });
    const row = await smsRowFor(user.id);
    expect(row.status).toBe('skipped');
    expect(row.error).toBe('no phone number');
  });

  test('someone who did not choose SMS is skipped, not failed', async () => {
    const user = await makeUser(emails.optedOut, { phone: '+250788123457', phoneVerifiedAt: new Date() });
    const row = await smsRowFor(user.id);
    expect(row.status).toBe('skipped');
    expect(row.error).toBe('not opted in');
  });

  test('a stored number the gateway cannot take is recorded as failed', async () => {
    // Numbers saved before validation existed can still be junk.
    const user = await makeUser(emails.badNumber, {
      preferredChannel: 'sms',
      phone: '0252123456',
      phoneVerifiedAt: new Date(),
    });
    const row = await smsRowFor(user.id);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('not a Rwandan mobile number');
  });
});

describe('profile rules for SMS', () => {
  let token: string;

  // makeUser stores a placeholder password hash, so sign a session the way
  // authController does rather than logging in.
  const asUser = async (email: string) => {
    const user = await db.User.findOne({ where: { email } });
    return jwt.sign({ id: user!.id, role: user!.role }, jwtSecret());
  };

  test('phone cannot be changed through the profile', async () => {
    token = await asUser(emails.verified);
    await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0799999999' })
      .expect(200);
    const user = await db.User.findOne({ where: { email: emails.verified } });
    expect(user?.phone).toBe('+250788123456');
  });

  test('SMS cannot be chosen before the number is confirmed', async () => {
    token = await asUser(emails.noPhone);
    await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredChannel: 'sms' })
      .expect(400);
  });

  test('SMS can be chosen once it is', async () => {
    token = await asUser(emails.optedOut);
    const response = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredChannel: 'sms' })
      .expect(200);
    expect(response.body.preferredChannel).toBe('sms');
  });
});
