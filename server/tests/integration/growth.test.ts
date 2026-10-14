import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import * as levelService from '../../src/services/levelService';
import * as matchScoringService from '../../src/services/matchScoringService';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `growth-worker-${stamp}@example.com`,
  client: `growth-client-${stamp}@example.com`,
};
let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({
    name: 'Growth Worker', email: emails.worker, passwordHash, role: 'worker', locationLat: -1.95, locationLng: 30.06,
  });
  users.client = await db.User.create({ name: 'Growth Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  await db.UserSkill.create({
    userId: users.worker.id, skillId: skill.id, proficiencyLevel: 3, verificationStatus: 'verified', provenanceDetail: null, selfDeclaredAt: null,
  });
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('levels', () => {
  test('a new worker is New, and the next level lists exactly what it takes', async () => {
    const level = await levelService.forWorker(users.worker);
    expect(level.level).toBe('new');
    expect(level.next).toBe('rising');
    expect(level.steps[0].criteria).toEqual([{ key: 'paidJobs', value: 0, target: 1, met: false }]);
  });

  test('levels are cumulative: Trusted needs paid jobs, a real trust score and a verified skill', async () => {
    const trusted = (await levelService.forWorker({ ...users.worker.get(), trustScore: 4.6, reviewCount: 9 } as never)).steps[1];
    const byKey = new Map(trusted.criteria.map((c) => [c.key, c]));
    expect(byKey.get('trust')?.met).toBe(true);
    expect(byKey.get('verifiedSkills')?.met).toBe(true);
    expect(byKey.get('paidJobs')?.met).toBe(false);
  });

  test('the public profile shows the level and availability', async () => {
    const res = await request(app).get(`/api/users/${users.worker.id}`).set(as('client'));
    expect(res.body.level).toBe('new');
    expect(res.body.availability).toBe('available');
  });
});

describe('availability', () => {
  test('an unknown availability is refused', async () => {
    const res = await request(app).put('/api/users/me').set(as('worker')).send({ availability: 'sleeping' });
    expect(res.status).toBe(400);
  });

  test('a worker away until a future date is left off ranked shortlists, and comes back after', async () => {
    const gig = await db.Gig.create({
      clientId: users.client.id, skillId: skill.id, title: 'Growth fixture', description: 'Fixture',
      budget: 10000, locationLat: -1.95, locationLng: 30.06, status: 'open',
    });
    const inList = async () =>
      (await matchScoringService.rankCandidates({ gig })).some((c) => c.workerId === users.worker.id);
    expect(await inList()).toBe(true);

    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await request(app).put('/api/users/me').set(as('worker')).send({ availability: 'away', availableFrom: future });
    expect(await inList()).toBe(false);

    const res = await request(app).put('/api/users/me').set(as('worker')).send({ availability: 'available' });
    expect(res.body.availableFrom).toBeNull();
    expect(await inList()).toBe(true);
  });
});

describe('changing your name', () => {
  test('a name is trimmed and saved', async () => {
    const res = await request(app).put('/api/users/me').set(as('worker')).send({ name: '  Grace   Uwase ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Grace Uwase');
  });

  test('a blank, too short or made-up name is refused', async () => {
    for (const name of ['', ' ', 'A', '<script>', '12345', 'x'.repeat(81)]) {
      const res = await request(app).put('/api/users/me').set(as('worker')).send({ name });
      expect(res.status).toBe(400);
    }
  });
});
