const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../../app');
const db = require('../../models');

const stamp = Date.now();
const emails = {
  client: `api-client-${stamp}@example.com`,
  worker: `api-worker-${stamp}@example.com`,
  admin: `api-admin-${stamp}@example.com`,
};

let clientToken;
let workerToken;
let adminToken;
let clientId;
let workerId;
let adminId;
let skillId;
let taskId;
let gigId;
let applicationId;
let matchId;
let transactionId;

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('auth', () => {
  test('registers a client and a worker', async () => {
    const client = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Aline Client', email: emails.client, password: 'pass1234', role: 'client' });
    expect(client.status).toBe(201);
    clientToken = client.body.token;
    clientId = client.body.userId;

    const worker = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eric Worker', email: emails.worker, password: 'pass1234', role: 'worker' });
    expect(worker.status).toBe(201);
    workerToken = worker.body.token;
    workerId = worker.body.userId;
  });

  test('rejects self-registering as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Nope', email: `nope-${stamp}@example.com`, password: 'pass1234', role: 'admin' });
    expect(res.status).toBe(400);
  });

  test('provisions an admin directly (not self-registerable) and logs in', async () => {
    const passwordHash = await bcrypt.hash('pass1234', 10);
    const admin = await db.User.create({ name: 'Grace Admin', email: emails.admin, passwordHash, role: 'admin' });
    adminId = admin.id;

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: emails.admin, password: 'pass1234' });
    expect(login.status).toBe(200);
    adminToken = login.body.token;
  });

  test('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: emails.client, password: 'pass1234', role: 'client' });
    expect(res.status).toBe(409);
  });

  test('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emails.client, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('rejects requests with no token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  test('never returns passwordHash on the profile', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.passwordHash).toBeUndefined();
  });
});

describe('skill verification', () => {
  test('worker sets their location', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ locationLat: -1.9536, locationLng: 30.0605 });
    expect(res.status).toBe(200);
    expect(res.body.locationLat).toBe(-1.9536);
  });

  test('looks up the seeded digital_web skill', async () => {
    const res = await request(app).get('/api/skills').query({ category: 'digital_web' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    skillId = res.body[0].id;
  });

  test('worker submits a skill task and is auto-assigned a reviewer (not themselves)', async () => {
    const res = await request(app)
      .post('/api/skill-tasks')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ skillId, evidenceUrl: 'https://example.com/evidence.png', notes: 'Sample work' });

    expect(res.status).toBe(201);
    expect(res.body.reviewerId).toBe(adminId);
    expect(res.body.reviewerId).not.toBe(workerId);
    taskId = res.body.id;
  });

  test('the worker cannot review their own task', async () => {
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });

  test('the assigned admin approves the task', async () => {
    const res = await request(app)
      .put(`/api/skill-tasks/${taskId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});

describe('gigs and applications', () => {
  test('client posts a gig, starting in pending_review', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'Build a landing page',
        description: 'Need a one-page site',
        budget: 50000,
        skillId,
        locationLat: -1.9441,
        locationLng: 30.0619,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending_review');
    gigId = res.body.id;
  });

  test('client posts a gig with an attached photo', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${clientToken}`)
      .field('title', 'Fix a leaking pipe')
      .field('description', 'Kitchen sink is leaking')
      .field('budget', '15000')
      .field('skillId', skillId)
      .field('locationLat', '-1.95')
      .field('locationLng', '30.06')
      .attach('image', Buffer.from('fake-image-bytes'), 'photo.jpg');
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/gigs\/.+\.jpg$/);

    const imageRes = await request(app).get(res.body.imageUrl);
    expect(imageRes.status).toBe(200);
  });

  test('rejects a non-image file attached as a gig photo', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${clientToken}`)
      .field('title', 'x')
      .field('description', 'y')
      .field('budget', '1')
      .field('skillId', skillId)
      .field('locationLat', '0')
      .field('locationLng', '0')
      .attach('image', Buffer.from('not an image'), 'notes.txt');
    expect(res.status).toBe(400);
  });

  test('a worker cannot post a gig', async () => {
    const res = await request(app)
      .post('/api/gigs')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ title: 'x', description: 'y', budget: 1, skillId, locationLat: 0, locationLng: 0 });
    expect(res.status).toBe(403);
  });

  test('a worker cannot apply while the gig is still pending review', async () => {
    const res = await request(app)
      .post('/api/gig-applications')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ gigId });
    expect(res.status).toBe(409);
  });

  test('admin approves the gig, publishing it', async () => {
    const res = await request(app)
      .put(`/api/admin/gigs/${gigId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
  });

  test('worker applies to the now-open gig', async () => {
    const res = await request(app)
      .post('/api/gig-applications')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ gigId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    applicationId = res.body.id;
  });

  test('the same worker cannot apply twice', async () => {
    const res = await request(app)
      .post('/api/gig-applications')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ gigId });
    expect(res.status).toBe(409);
  });

  test('admin approves the application, creating an accepted match and flipping the gig to matched', async () => {
    const res = await request(app)
      .put(`/api/gig-applications/${applicationId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('approved');
    expect(res.body.match.status).toBe('accepted');
    matchId = res.body.match.id;

    const gigRes = await request(app).get(`/api/gigs/${gigId}`);
    expect(gigRes.body.status).toBe('matched');
  });
});

describe('match lifecycle and simulated payment', () => {
  test('cannot transition an accepted match backwards to pending', async () => {
    const res = await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ status: 'pending' });
    expect(res.status).toBe(409);
  });

  test('completing the match auto-initiates a simulated transaction', async () => {
    const res = await request(app)
      .put(`/api/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toBeTruthy();
    expect(res.body.transaction.status).toBe('initiated');
    transactionId = res.body.transaction.id;
  });

  test('either party can confirm the simulated payment', async () => {
    const res = await request(app)
      .post(`/api/transactions/${transactionId}/confirm`)
      .set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });
});

describe('reviews and trust score', () => {
  test('client reviews the worker', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ matchId, rating: 5, comment: 'Great work' });
    expect(res.status).toBe(201);
  });

  test('cannot review the same match twice as the same author', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ matchId, rating: 4 });
    expect(res.status).toBe(409);
  });

  test("worker's trust score reflects the new review", async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${workerToken}`);
    expect(res.body.trustScore).toBe(5);
  });
});

describe('messaging', () => {
  test('worker messages the admin who reviewed them', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ recipientId: adminId, body: 'Thanks for reviewing my task!' });
    expect(res.status).toBe(201);
  });

  test('the thread is visible to the sender', async () => {
    const res = await request(app)
      .get('/api/messages')
      .query({ recipientId: adminId })
      .set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('a worker and the client they worked with can message each other', async () => {
    const fromWorker = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${workerToken}`)
      .send({ recipientId: clientId, body: 'Hi, checking in about the gig.' });
    expect(fromWorker.status).toBe(201);

    const fromClient = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ recipientId: workerId, body: 'All good, thanks!' });
    expect(fromClient.status).toBe(201);
  });

  test('two clients cannot message each other', async () => {
    const otherClient = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other Client', email: `api-client-2-${stamp}@example.com`, password: 'pass1234', role: 'client' });
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ recipientId: otherClient.body.userId, body: 'Hello?' });
    expect(res.status).toBe(403);
    await db.User.destroy({ where: { email: `api-client-2-${stamp}@example.com` } });
  });

  test('listing contacts returns everyone messaged so far', async () => {
    const res = await request(app)
      .get('/api/messages/contacts')
      .set('Authorization', `Bearer ${workerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

describe('password reset', () => {
  let resetToken;

  test('requesting a reset for a registered email returns a token', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: emails.worker });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeTruthy();
    resetToken = res.body.resetToken;
  });

  test('requesting a reset for an unknown email does not leak a token', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `nobody-${stamp}@example.com` });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
  });

  test('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'newpass123' });
    expect(res.status).toBe(400);
  });

  test('resets the password with a valid token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'newpass123' });
    expect(res.status).toBe(200);
  });

  test('logging in with the old password now fails', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emails.worker, password: 'pass1234' });
    expect(res.status).toBe(401);
  });

  test('logging in with the new password succeeds', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emails.worker, password: 'newpass123' });
    expect(res.status).toBe(200);
  });

  test('the reset token cannot be reused', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'anotherpass123' });
    expect(res.status).toBe(400);
  });
});

describe('admin: gig visibility', () => {
  test("the completed gig's admin listing includes the worker who completed it and the payment status", async () => {
    const res = await request(app).get('/api/admin/gigs').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const gig = res.body.find((g) => g.id === gigId);
    expect(gig.status).toBe('completed');
    const match = gig.matches.find((m) => m.id === matchId);
    expect(match.status).toBe('completed');
    expect(match.worker.id).toBe(workerId);
    expect(match.transaction.status).toBe('confirmed');
  });
});

describe('admin: user moderation', () => {
  const modEmail = `api-moderation-worker-${stamp}@example.com`;
  const otherAdminEmail = `api-moderation-admin-${stamp}@example.com`;
  let modToken;
  let modId;
  let otherAdminId;

  afterAll(async () => {
    await db.User.destroy({ where: { email: [modEmail, otherAdminEmail] } });
  });

  test('sets up a throwaway worker to moderate', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Moderation Target', email: modEmail, password: 'pass1234', role: 'worker' });
    expect(res.status).toBe(201);
    modToken = res.body.token;
    modId = res.body.userId;
  });

  test('a non-admin cannot suspend a user', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${modId}/moderate`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(403);
  });

  test('admin cannot suspend their own account', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${adminId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(403);
  });

  test('admin cannot suspend another admin', async () => {
    const passwordHash = await bcrypt.hash('pass1234', 10);
    const otherAdmin = await db.User.create({
      name: 'Other Admin',
      email: otherAdminEmail,
      passwordHash,
      role: 'admin',
    });
    otherAdminId = otherAdmin.id;

    const res = await request(app)
      .put(`/api/admin/users/${otherAdminId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(403);
  });

  test('admin suspends the worker', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${modId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');
  });

  test('the suspended worker is immediately rejected on their existing token, not just at future logins', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${modToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  test('the suspended worker cannot log in', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: modEmail, password: 'pass1234' });
    expect(res.status).toBe(403);
  });

  test('admin reactivates the worker', async () => {
    const res = await request(app)
      .put(`/api/admin/users/${modId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'activate' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  test('the reactivated worker can log in again', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: modEmail, password: 'pass1234' });
    expect(res.status).toBe(200);
  });

  test('admin cannot delete their own account', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('admin deletes the worker', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${modId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const stillThere = await db.User.findByPk(modId);
    expect(stillThere).toBeNull();
  });
});
