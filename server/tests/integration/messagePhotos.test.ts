import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `msg-worker-${stamp}@example.com`,
  client: `msg-client-${stamp}@example.com`,
};

const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Msg Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Msg Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await db.Message.destroy({ where: { senderId: [users.worker.id, users.client.id] } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('photos in messages', () => {
  test('a photo can be sent on its own, and arrives with who sent it', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('image', png, { filename: 'screen.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toMatch(/^\/uploads\/messages\/[^?]+\.png\?exp=\d+&sig=/);
    expect(res.body.body).toBe('');
    expect(res.body.sender.name).toBe('Msg Client');
  });

  test('a photo and text can go together', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .field('body', 'This is the crack, top left.')
      .attach('image', png, { filename: 'crack.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe('This is the crack, top left.');
    expect(res.body.imageSha256).toHaveLength(64);
  });

  test('text-only messages still work as plain JSON', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('worker'))
      .send({ recipientId: users.client.id, body: 'Got it, I will bring a new screen.' });
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeNull();
  });

  test('an empty message with no photo is refused', async () => {
    const res = await request(app).post('/api/messages').set(as('worker')).send({ recipientId: users.client.id, body: '  ' });
    expect(res.status).toBe(400);
  });

  test('only images can be attached', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('image', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('unread and seen', () => {
  test('the recipient sees an unread count and a preview until they read the thread', async () => {
    const before = await request(app).get('/api/messages/contacts').set(as('worker'));
    const client = before.body.find((c: { id: string }) => c.id === users.client.id);
    expect(client.unreadCount).toBe(2);
    expect(client.lastMessage.fromMe).toBe(true);

    const read = await request(app).post('/api/messages/read').set(as('worker')).send({ contactId: users.client.id });
    expect(read.body.marked).toBe(2);

    const after = await request(app).get('/api/messages/contacts').set(as('worker'));
    expect(after.body.find((c: { id: string }) => c.id === users.client.id).unreadCount).toBe(0);

    // The sender's copy now carries the time it was seen.
    const thread = await request(app).get('/api/messages').query({ recipientId: users.worker.id }).set(as('client'));
    const fromClient = thread.body.filter((m: { senderId: string }) => m.senderId === users.client.id);
    expect(fromClient.every((m: { readAt: string | null }) => m.readAt)).toBe(true);
  });
});
