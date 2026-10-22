import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';

// API responses are compressed when the client accepts it and the body is worth it.

const stamp = Date.now();
const email = `gzip-${stamp}@example.com`;
let token: string;

beforeAll(async () => {
  // A full profile, so the reply is well over the 1 KB threshold.
  await db.User.create({
    name: 'Gzip Check', email, passwordHash: await bcrypt.hash('password123', 10), role: 'client',
    bio: 'I run a small salon in Kimironko and post jobs for website updates, price lists and photos. '.repeat(8),
  });
  token = (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.token;
});

afterAll(async () => {
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

test('a large JSON reply is gzipped for a client that accepts it', async () => {
  const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`).set('Accept-Encoding', 'gzip');
  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
  expect(res.body.email).toBe(email); // still the same data once decoded
});

test('a tiny reply is not compressed', async () => {
  const res = await request(app).get('/health').set('Accept-Encoding', 'gzip');
  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBeUndefined();
});
