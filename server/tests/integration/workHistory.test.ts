import crypto from 'crypto';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as workHistoryService from '../../src/services/workHistoryService';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `history-worker-${stamp}@example.com`,
  client: `history-client-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

// A valid 1x1 PNG, varied per call so each upload has its own hash.
const png = (seed: number) => {
  const base = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  return Buffer.concat([base, Buffer.from([seed])]);
};

const acceptedJob = async (title = `History fixture ${Math.random().toString(36).slice(2, 7)}`) => {
  const gig = await db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title,
    description: 'Fixture',
    budget: 20000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });
  const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
  await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
  return { gig, matchId: match.id };
};

const releaseAndReview = async (matchId: string, rating = 5) => {
  const tx = must(await db.Transaction.findOne({ where: { matchId } }), 'tx');
  await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client'));
  await request(app).put(`/api/matches/${matchId}/status`).set(as('client')).send({ status: 'completed' });
  await request(app).post('/api/reviews').set(as('client')).send({ matchId, rating, comment: 'Neat work' });
};

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'History Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'History Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('job photos', () => {
  test('the worker attaches photos, each hashed to the bytes uploaded', async () => {
    const { matchId } = await acceptedJob();
    const res = await request(app)
      .post(`/api/matches/${matchId}/photos`)
      .set(as('worker'))
      .attach('photos', png(1), { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', png(2), { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.photos).toHaveLength(2);
    const hashes = res.body.photos.map((p: { sha256: string }) => p.sha256);
    expect(hashes).toContain(crypto.createHash('sha256').update(png(1)).digest('hex'));
  });

  test('a job holds at most three photos', async () => {
    const { matchId } = await acceptedJob();
    const first = request(app).post(`/api/matches/${matchId}/photos`).set(as('worker'));
    for (const n of [1, 2, 3]) first.attach('photos', png(n), { filename: `${n}.png`, contentType: 'image/png' });
    expect((await first).status).toBe(201);
    const fourth = await request(app)
      .post(`/api/matches/${matchId}/photos`)
      .set(as('worker'))
      .attach('photos', png(4), { filename: '4.png', contentType: 'image/png' });
    expect(fourth.status).toBe(409);
  });

  test('only the worker on the job can add photos', async () => {
    const { matchId } = await acceptedJob();
    const res = await request(app)
      .post(`/api/matches/${matchId}/photos`)
      .set(as('client'))
      .attach('photos', png(5), { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  test('files that are not images are refused', async () => {
    const { matchId } = await acceptedJob();
    const res = await request(app)
      .post(`/api/matches/${matchId}/photos`)
      .set(as('worker'))
      .attach('photos', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.JobPhoto.count({ where: { matchId } })).toBe(0);
  });
});

describe('work history', () => {
  test('a paid job appears with its rating, photos and receipt; an unpaid one does not', async () => {
    const paid = await acceptedJob('Paid and reviewed');
    await request(app)
      .post(`/api/matches/${paid.matchId}/photos`)
      .set(as('worker'))
      .attach('photos', png(9), { filename: 'done.png', contentType: 'image/png' });
    await releaseAndReview(paid.matchId, 4);
    await acceptedJob('Still in progress');

    const res = await request(app).get(`/api/users/${users.worker.id}/work-history`).set(as('client'));
    expect(res.status).toBe(200);
    const titles = res.body.map((e: { gig: string }) => e.gig);
    expect(titles).toContain('Paid and reviewed');
    expect(titles).not.toContain('Still in progress');
    const entry = res.body.find((e: { gig: string }) => e.gig === 'Paid and reviewed');
    expect(entry.rating).toBe(4);
    expect(entry.photos).toHaveLength(1);
    expect(entry.receiptNumber).toMatch(/^ISK-/);
  });

  test('paid jobs are counted per skill for the passport', async () => {
    const counts = await workHistoryService.paidJobsBySkill(users.worker.id);
    expect(counts.get(skill.id)).toBeGreaterThanOrEqual(1);
  });
});
