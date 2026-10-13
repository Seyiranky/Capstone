import fs from 'fs';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `voice-worker-${stamp}@example.com`,
  client: `voice-client-${stamp}@example.com`,
};

const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

// The bytes are not decoded server-side; only the declared type and size matter.
const clip = Buffer.from('1a45dfa3' + '00'.repeat(512), 'hex');
const uploaded = (url: string) => path.join(__dirname, '..', '..', url);

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Voice Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Voice Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterAll(async () => {
  await db.Message.destroy({ where: { senderId: [users.worker.id, users.client.id] } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('voice notes in messages', () => {
  test('a voice note can be sent on its own and is stored with its length', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .field('audioDurationSec', '14.6')
      .attach('audio', clip, { filename: 'blob', contentType: 'audio/webm' });
    expect(res.status).toBe(201);
    expect(res.body.audioUrl).toMatch(/^\/uploads\/messages\/.+\.webm$/);
    expect(res.body.audioMimeType).toBe('audio/webm');
    expect(res.body.audioDurationSec).toBe(15);
    expect(res.body.body).toBe('');
    expect(fs.existsSync(uploaded(res.body.audioUrl))).toBe(true);
  });

  test('the conversation list marks the last message as a voice note', async () => {
    const res = await request(app).get('/api/messages/contacts').set(as('worker'));
    const contact = res.body.find((c: { id: string }) => c.id === users.client.id);
    expect(contact.lastMessage.hasAudio).toBe(true);
  });

  test('anything that is not audio is refused under the audio field', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('audio', clip, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  test('a note longer than two minutes is refused and its file removed', async () => {
    const before = fs.readdirSync(path.join(__dirname, '..', '..', 'uploads', 'messages')).length;
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .field('audioDurationSec', '600')
      .attach('audio', clip, { filename: 'long.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(400);
    expect(fs.readdirSync(path.join(__dirname, '..', '..', 'uploads', 'messages')).length).toBe(before);
  });

  test('a note over 3MB is refused', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set(as('client'))
      .field('recipientId', users.worker.id)
      .attach('audio', Buffer.alloc(3 * 1024 * 1024 + 1), { filename: 'big.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(400);
  });
});

describe('voice notes on gigs', () => {
  test('a client can describe the job aloud when posting it', async () => {
    const skill = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill');
    const res = await request(app)
      .post('/api/gigs')
      .set(as('client'))
      .field('title', 'Alter a wedding dress')
      .field('description', 'Details in the voice note.')
      .field('budget', '30000')
      .field('skillId', skill.id)
      .field('locationLat', '-1.95')
      .field('locationLng', '30.06')
      .field('voiceDurationSec', '42')
      .attach('voice', clip, { filename: 'blob', contentType: 'audio/mp4' });
    expect(res.status).toBe(201);
    expect(res.body.voiceNoteUrl).toMatch(/^\/uploads\/gigs\/.+\.m4a$/);
    expect(res.body.voiceNoteDurationSec).toBe(42);

    const read = await request(app).get(`/api/gigs/${res.body.id}`).set(as('worker'));
    expect(read.body.voiceNoteUrl).toBe(res.body.voiceNoteUrl);
  });
});
