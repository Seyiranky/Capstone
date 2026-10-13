import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `sec-worker-${stamp}@example.com`,
  other: `sec-other-${stamp}@example.com`,
  client: `sec-client-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
let pendingGigId: string;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({
    name: 'Sec Worker',
    email: emails.worker,
    passwordHash,
    role: 'worker',
    phone: '+250788000111',
    trustedContactName: 'Sister',
    trustedContactPhone: '+250788000222',
  });
  users.other = await db.User.create({ name: 'Sec Other', email: emails.other, passwordHash, role: 'worker' });
  users.client = await db.User.create({
    name: 'Sec Client',
    email: emails.client,
    passwordHash,
    role: 'client',
    phone: '+250788000333',
  });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  const skill = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill');
  const open = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: 'Security fixture open',
    description: 'Fixture',
    budget: 10000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  await db.GigApplication.create({ gigId: open.id, workerId: users.worker.id, status: 'pending' });
  pendingGigId = (
    await db.Gig.create({
      clientId: users.client.id,
      skillId: skill.id,
      title: 'Security fixture pending',
      description: 'Fixture',
      budget: 10000,
      locationLat: -1.95,
      locationLng: 30.06,
      status: 'pending_review',
    })
  ).id;
});

afterAll(async () => {
  await db.Message.destroy({ where: { senderId: [users.worker.id, users.client.id] } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: [...Object.values(emails), `new-${stamp}@example.com`] } });
  await db.sequelize.close();
});

const PRIVATE = ['email', 'phone', 'trustedContactPhone', 'trustedContactName', 'savingsPercent', 'monthlyGoal', 'experimentArm', 'locationLat', 'passwordHash', 'resetToken'];

describe('personal details stay private', () => {
  test('a gig seen by anyone carries none of its client’s contact details', async () => {
    const res = await request(app).get('/api/gigs');
    const gig = must(res.body.find((g: { clientId: string }) => g.clientId === users.client.id), 'gig');
    for (const field of PRIVATE) expect(gig.client).not.toHaveProperty(field);
    expect(gig.client.name).toBe('Sec Client');
  });

  test('an applicant seen by the client carries none of the worker’s details', async () => {
    const res = await request(app).get('/api/gig-applications').set(as('client'));
    const application = must(res.body.find((a: { workerId: string }) => a.workerId === users.worker.id), 'application');
    for (const field of PRIVATE) expect(application.worker).not.toHaveProperty(field);
  });

  test('the user still sees their own details, but never their password hash', async () => {
    const res = await request(app).get('/api/users/me').set(as('worker'));
    expect(res.body.email).toBe(emails.worker);
    expect(res.body.trustedContactPhone).toBe('+250788000222');
    expect(res.body).not.toHaveProperty('passwordHash');
  });
});

describe('gigs awaiting approval', () => {
  test('are hidden from the public and from other workers', async () => {
    expect((await request(app).get(`/api/gigs/${pendingGigId}`)).status).toBe(404);
    expect((await request(app).get(`/api/gigs/${pendingGigId}`).set(as('other'))).status).toBe(404);
    const list = await request(app).get('/api/gigs').set(as('other'));
    expect(list.body.some((g: { id: string }) => g.id === pendingGigId)).toBe(false);
  });

  test('are shown to the client who posted them', async () => {
    expect((await request(app).get(`/api/gigs/${pendingGigId}`).set(as('client'))).status).toBe(200);
  });
});

describe('private files', () => {
  let url: string;

  test('chat photos are only served through a signed link', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('image', png, { filename: 'photo.png', contentType: 'image/png' });
    url = res.body.imageUrl;
    expect((await request(app).get(url)).status).toBe(200);
    expect((await request(app).get(url.split('?')[0])).status).toBe(403);
    expect((await request(app).get(url.replace(/sig=.{4}/, 'sig=AAAA'))).status).toBe(403);
  });

  test('a file named .html is stored by its checked type, never as a web page', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('image', png, { filename: 'evil.html', contentType: 'image/png' });
    expect(res.body.imageUrl).toMatch(/\.png\?/);
  });
});

describe('sign-up and sign-in', () => {
  test('refuses an invalid email and a short password', async () => {
    const base = { name: 'New', role: 'worker' };
    expect((await request(app).post('/api/auth/register').send({ ...base, email: 'not-an-email', password })).status).toBe(400);
    expect(
      (await request(app).post('/api/auth/register').send({ ...base, email: `new-${stamp}@example.com`, password: 'short' })).status,
    ).toBe(400);
  });

  test('treats email addresses case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New', role: 'worker', email: `NEW-${stamp}@Example.com`, password });
    expect(res.status).toBe(201);
    expect((await request(app).post('/api/auth/login').send({ email: `new-${stamp}@example.com`, password })).status).toBe(200);
    expect(
      (await request(app).post('/api/auth/register').send({ name: 'Dup', role: 'worker', email: `new-${stamp}@example.com`, password })).status,
    ).toBe(409);
  });

  test('password reset answers the same for registered and unknown addresses', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const known = await request(app).post('/api/auth/forgot-password').send({ email: emails.other });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: `ghost-${stamp}@example.com` });
    logSpy.mockRestore();
    expect(known.body).toEqual(unknown.body);
    expect(known.body).not.toHaveProperty('resetToken');
  });

  test('repeated failed logins are slowed down', async () => {
    process.env.RATE_LIMIT_IN_TESTS = '1';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await request(app).post('/api/auth/login').send({ email: emails.other, password: 'wrong-password' })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_IN_TESTS;
    }
  });
});

describe('phone numbers', () => {
  test('a number confirmed on one account cannot be confirmed on another', async () => {
    const number = `+2507${String(stamp).slice(-8)}`;
    await users.client.update({ phone: number, phoneVerifiedAt: new Date() });
    const res = await request(app).post('/api/auth/send-phone-code').set(as('worker')).send({ phone: number });
    expect(res.status).toBe(409);
    await users.client.update({ phone: null, phoneVerifiedAt: null });
  });
});

describe('changing the password', () => {
  test('needs the current password, and signs out every other session', async () => {
    const other = tokens.other;
    // A second device, signed in a moment earlier.
    await new Promise((r) => setTimeout(r, 1100));
    expect(
      (await request(app).put('/api/auth/password').set(as('other')).send({ currentPassword: 'wrong', newPassword: 'brand-new-pass' })).status,
    ).toBe(401);
    const res = await request(app)
      .put('/api/auth/password')
      .set(as('other'))
      .send({ currentPassword: password, newPassword: 'brand-new-pass' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/users/me').set({ Authorization: `Bearer ${other}` })).status).toBe(401);
    expect((await request(app).get('/api/users/me').set({ Authorization: `Bearer ${res.body.token}` })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: emails.other, password: 'brand-new-pass' })).status).toBe(200);
  });
});

describe('transport', () => {
  test('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('only the app’s own origin may call the API from a browser', async () => {
    const good = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    const bad = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
