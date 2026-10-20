import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  admin: `roles-admin-${stamp}@example.com`,
  client: `roles-client-${stamp}@example.com`,
  otherClient: `roles-client2-${stamp}@example.com`,
};
const roleOf: Record<string, 'admin' | 'client'> = { admin: 'admin', client: 'client', otherClient: 'client' };

const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const send = (from: string, to: string, body: string) =>
  request(app).post('/api/messages').set(as(from)).send({ recipientId: users[to].id, body });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  for (const key of Object.keys(emails)) {
    users[key] = await db.User.create({ name: `Roles ${key}`, email: emails[key], passwordHash, role: roleOf[key] });
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await db.Message.destroy({ where: { senderId: ids } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('who may message whom', () => {
  test('an admin can message a client, and the client can answer', async () => {
    const out = await send('admin', 'client', 'About your applicant: is the job still open?');
    expect(out.status).toBe(201);
    const back = await send('client', 'admin', 'Yes, still open.');
    expect(back.status).toBe(201);
  });

  test('two clients still cannot message each other', async () => {
    const res = await send('client', 'otherClient', 'Hello');
    expect(res.status).toBe(403);
  });
});
