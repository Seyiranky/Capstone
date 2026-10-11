import notify from '../../src/lib/notify';
import db from '../../src/models';
import { waitForDeliveries } from '../helpers/fixtures';

// No mail account needed: the log driver prints and reports success, which is
// what lets the delivery bookkeeping be tested at all.
process.env.EMAIL_DRIVER = 'log';

const stamp = Date.now();
const emails = {
  optedIn: `notify-email-in-${stamp}@example.com`,
  unverified: `notify-email-unverified-${stamp}@example.com`,
  optedOut: `notify-email-out-${stamp}@example.com`,
};

let logSpy: jest.SpyInstance;

const makeUser = async (email: string, overrides: Record<string, unknown> = {}) =>
  db.User.create({
    name: 'Notify Email Test',
    email,
    passwordHash: 'x',
    role: 'worker',
    ...overrides,
  });

beforeAll(() => {
  // The log driver writes the whole message to stdout; silence it so the
  // suite's output stays readable.
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(async () => {
  logSpy.mockRestore();
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

const deliveriesFor = (notificationId: string, channel: string) => () =>
  db.NotificationDelivery.findAll({ where: { notificationId, channel } });

// `req` is undefined throughout: in-app delivery is best-effort through
// Socket.IO and these cases are about the bookkeeping, not the socket.
const send = (userId: string, category?: 'activity' | 'outcome' | 'critical') =>
  notify(undefined, { userId, title: 'Payment confirmed', body: 'You received 25,000 RWF.', category });

describe('email delivery', () => {
  test('a verified, opted-in recipient is sent email and the row records it', async () => {
    const user = await makeUser(emails.optedIn, {
      preferredChannel: 'email',
      emailVerifiedAt: new Date(),
    });

    const notification = await send(user.id, 'critical');
    const [row] = await waitForDeliveries(deliveriesFor(notification.id, 'email'));

    expect(row.status).toBe('sent');
    expect(row.provider).toBe('log');
    expect(row.sentAt).toBeInstanceOf(Date);
  });

  test('someone who did not choose email is skipped, not failed', async () => {
    const user = await makeUser(emails.optedOut);

    const notification = await send(user.id, 'critical');
    const [row] = await waitForDeliveries(deliveriesFor(notification.id, 'email'));

    expect(row.status).toBe('skipped');
    expect(row.error).toBe('not opted in');
  });

  test('an unconfirmed address is skipped with its own reason', async () => {
    // Distinct from "not opted in": this person asked for email and has not
    // clicked the link, which is someone to nudge rather than someone who said no.
    const user = await makeUser(emails.unverified, { preferredChannel: 'email' });

    const notification = await send(user.id, 'critical');
    const [row] = await waitForDeliveries(deliveriesFor(notification.id, 'email'));

    expect(row.status).toBe('skipped');
    expect(row.error).toBe('email not verified');
  });

  test('a driver failure is recorded with the reason', async () => {
    process.env.EMAIL_DRIVER = 'nope';
    const user = await db.User.findOne({ where: { email: emails.optedIn } });

    const notification = await send(user!.id, 'critical');
    const [row] = await waitForDeliveries(deliveriesFor(notification.id, 'email'));

    expect(row.status).toBe('failed');
    expect(row.provider).toBe('nope');
    expect(row.error).toContain("Unknown EMAIL_DRIVER 'nope'");

    process.env.EMAIL_DRIVER = 'log';
  });
});

describe('category decides the channels', () => {
  test('an un-annotated notification produces no email or SMS row at all', async () => {
    // The regression guard for the notices left as activity: an opted-in,
    // verified user must still not be emailed or texted routine chatter.
    const user = await db.User.findOne({ where: { email: emails.optedIn } });

    const notification = await send(user!.id);

    // in_app is written by notify itself, and is awaited, so once it exists no
    // off-app delivery was started.
    await waitForDeliveries(deliveriesFor(notification.id, 'in_app'));

    const offApp = await db.NotificationDelivery.findAll({
      where: { notificationId: notification.id, channel: ['email', 'sms'] },
    });
    expect(offApp).toHaveLength(0);
  });

  test('in-app and SMS still happen for an outcome, alongside email', async () => {
    const user = await db.User.findOne({ where: { email: emails.optedIn } });

    const notification = await send(user!.id, 'outcome');

    const rows = await waitForDeliveries(
      () => db.NotificationDelivery.findAll({ where: { notificationId: notification.id } }),
      { expected: 3 },
    );
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app', 'sms']);
  });

  test('category is not written onto the notification row', async () => {
    const user = await db.User.findOne({ where: { email: emails.optedOut } });

    const notification = await send(user!.id, 'critical');
    const stored = await db.Notification.findByPk(notification.id);

    expect(stored).not.toBeNull();
    expect((stored as unknown as Record<string, unknown>).category).toBeUndefined();
  });
});
