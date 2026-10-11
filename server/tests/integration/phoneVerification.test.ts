import request from 'supertest';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const email = `phone-verify-${stamp}@example.com`;
let token: string;
let userId: string;
let logSpy: jest.SpyInstance;

beforeAll(async () => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Phone Verify Test', email, password: 'password123', role: 'worker' });
  token = registered.body.token;
  userId = registered.body.userId;
});

afterAll(async () => {
  logSpy.mockRestore();
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

const reload = () => db.User.unscoped().findByPk(userId);
const post = (path: string, body: object) =>
  request(app).post(`/api/auth/${path}`).set('Authorization', `Bearer ${token}`).send(body);

/** The code the log driver printed most recently. */
const lastCode = (): string => {
  const lines = logSpy.mock.calls.map((args) => String(args[0])).filter((l) => l.startsWith('[sms:log]'));
  const match = lines.at(-1)?.match(/code: (\d{6})/);
  if (!match) throw new Error('No code was sent');
  return match[1];
};

// Lets a test send again without waiting out the 60-second cooldown.
const skipCooldown = async () => {
  const user = await reload();
  await user!.update({ phoneVerificationExpiresAt: new Date(Date.now() + 60_000) });
};

describe('phone verification', () => {
  test('both endpoints require a session', async () => {
    await request(app).post('/api/auth/send-phone-code').send({ phone: '0788123456' }).expect(401);
    await request(app).post('/api/auth/verify-phone').send({ code: '123456' }).expect(401);
  });

  test('an invalid number is refused and nothing is sent', async () => {
    logSpy.mockClear();
    const response = await post('send-phone-code', { phone: '0252123456' }).expect(400);
    expect(response.body.message).toContain('Rwandan mobile');
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('sending a code stores the number and a hash, never the code', async () => {
    const response = await post('send-phone-code', { phone: '0788 123 456' }).expect(200);
    const code = lastCode();

    expect(response.body.phone).toBe('+250788123456');
    expect(JSON.stringify(response.body)).not.toContain(code);

    const user = await reload();
    expect(user?.phone).toBe('+250788123456');
    expect(user?.phoneVerifiedAt).toBeNull();
    expect(user?.phoneVerificationCodeHash).toHaveLength(64);
    expect(user?.phoneVerificationCodeHash).not.toContain(code);
  });

  test('the hash is not readable through the API', async () => {
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.body).not.toHaveProperty('phoneVerificationCodeHash');
  });

  test('a second request inside the cooldown is refused', async () => {
    const response = await post('send-phone-code', { phone: '0788123456' }).expect(429);
    expect(response.body.retryAfter).toBeGreaterThan(0);
  });

  test('a malformed code is refused without spending an attempt', async () => {
    await post('verify-phone', { code: '12ab' }).expect(400);
    expect((await reload())?.phoneVerificationAttempts).toBe(0);
  });

  test('a wrong code counts down, and the right one confirms the number', async () => {
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    const miss = await post('verify-phone', { code: wrong }).expect(400);
    expect(miss.body.attemptsLeft).toBe(4);

    await post('verify-phone', { code }).expect(200);
    const user = await reload();
    expect(user?.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(user?.phoneVerificationCodeHash).toBeNull();
  });

  test('a used code cannot be replayed', async () => {
    await post('verify-phone', { code: lastCode() }).expect(400);
  });

  test('asking again for a confirmed number sends nothing', async () => {
    logSpy.mockClear();
    const response = await post('send-phone-code', { phone: '+250788123456' }).expect(200);
    expect(response.body.verified).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('changing the number clears the confirmation', async () => {
    await post('send-phone-code', { phone: '0722123456' }).expect(200);
    const user = await reload();
    expect(user?.phone).toBe('+250722123456');
    expect(user?.phoneVerifiedAt).toBeNull();
  });

  test('five wrong codes spend the code', async () => {
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await post('verify-phone', { code: wrong }).expect(400);
    }
    const locked = await post('verify-phone', { code }).expect(400);
    expect(locked.body.expired).toBe(true);
  });

  test('an expired code is refused', async () => {
    await skipCooldown();
    await post('send-phone-code', { phone: '0722123456' }).expect(200);
    const user = await reload();
    await user!.update({ phoneVerificationExpiresAt: new Date(Date.now() - 1000) });

    const response = await post('verify-phone', { code: lastCode() }).expect(400);
    expect(response.body.expired).toBe(true);
  });
});
