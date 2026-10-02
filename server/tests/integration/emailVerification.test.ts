import request from 'supertest';
import app from '../../src/app';
import db from '../../src/models';

// The log driver prints instead of sending, so this whole flow runs with no
// mail account -- which is the point of the driver existing.
process.env.EMAIL_DRIVER = 'log';

const stamp = Date.now();
const email = `verify-${stamp}@example.com`;
let token: string;
let userId: string;

beforeAll(async () => {
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Verify Test', email, password: 'password123', role: 'worker' });
  token = registered.body.token;
  userId = registered.body.userId;
});

afterAll(async () => {
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

// Unscoped on purpose: defaultScope hides emailVerificationToken, which is
// the behaviour the "not readable through the API" case below asserts. These
// tests have to see the stored token to spend it.
const reload = () => db.User.unscoped().findByPk(userId);

describe('email verification', () => {
  test('a new account starts unverified', async () => {
    const user = await reload();
    expect(user?.emailVerifiedAt).toBeNull();
  });

  test('requesting a link requires a session', async () => {
    await request(app).post('/api/auth/send-verification').expect(401);
  });

  test('requesting a link stores a token and an expiry', async () => {
    const response = await request(app)
      .post('/api/auth/send-verification')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The token is a bearer credential for claiming the address. forgotPassword
    // hands its equivalent back in the body; this must not copy that.
    expect(JSON.stringify(response.body)).not.toContain('emailVerificationToken');

    const user = await reload();
    expect(user?.emailVerificationToken).toHaveLength(64);
    expect(user?.emailVerificationExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  test('a second request inside the cooldown is refused', async () => {
    const response = await request(app)
      .post('/api/auth/send-verification')
      .set('Authorization', `Bearer ${token}`)
      .expect(429);

    expect(response.body.retryAfter).toBeGreaterThan(0);
  });

  test('the token is not readable through the API', async () => {
    // defaultScope excludes it, so even the account's own profile must not
    // carry it -- otherwise any XSS on the client leaks a claimable address.
    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.emailVerificationToken).toBeUndefined();
  });

  test('an unknown token is rejected', async () => {
    await request(app).post('/api/auth/verify-email').send({ token: 'nope' }).expect(400);
  });

  test('a missing token is rejected', async () => {
    await request(app).post('/api/auth/verify-email').send({}).expect(400);
  });

  test('an expired token is rejected', async () => {
    const user = await reload();
    const stored = user!.emailVerificationToken;
    await user!.update({ emailVerificationExpiresAt: new Date(Date.now() - 1000) });

    await request(app).post('/api/auth/verify-email').send({ token: stored }).expect(400);
    expect((await reload())?.emailVerifiedAt).toBeNull();

    // Put it back so the success case below has a live token to spend.
    await user!.update({ emailVerificationExpiresAt: new Date(Date.now() + 60_000) });
  });

  test('a valid token confirms the address and is then spent', async () => {
    const stored = (await reload())!.emailVerificationToken;

    await request(app).post('/api/auth/verify-email').send({ token: stored }).expect(200);

    const user = await reload();
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user?.emailVerificationToken).toBeNull();
    expect(user?.emailVerificationExpiresAt).toBeNull();

    // A forwarded email must not be replayable.
    await request(app).post('/api/auth/verify-email').send({ token: stored }).expect(400);
  });

  test('asking again once verified says so instead of sending another link', async () => {
    const response = await request(app)
      .post('/api/auth/send-verification')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.verified).toBe(true);
    expect((await reload())?.emailVerificationToken).toBeNull();
  });
});
