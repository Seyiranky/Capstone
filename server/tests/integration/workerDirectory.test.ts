import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const tag = `Dir${String(stamp).slice(-6)}`;
const emails: Record<string, string> = {
  proven: `dir-proven-${stamp}@example.com`,
  declared: `dir-declared-${stamp}@example.com`,
  away: `dir-away-${stamp}@example.com`,
  client: `dir-client-${stamp}@example.com`,
  plainClient: `dir-plain-${stamp}@example.com`,
  other: `dir-other-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let gigId: string;

const search = (who: string, params: Record<string, string> = {}) =>
  request(app).get('/api/users/directory').set(as(who)).query({ q: tag, ...params });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const tailoring = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill');
  const make = (key: string, extra: Record<string, unknown>) =>
    db.User.create({ email: emails[key], passwordHash, ...extra } as never);
  users.proven = await make('proven', {
    name: `${tag} Proven`, role: 'worker', phone: '+250788111222', phoneVerifiedAt: new Date(),
    trustScore: 4.6, locationLat: -1.9889, locationLng: 30.1,
  });
  users.declared = await make('declared', { name: `${tag} Declared`, role: 'worker', trustScore: 3.2 });
  users.away = await make('away', { name: `${tag} Away`, role: 'worker', availability: 'away' });
  users.client = await make('client', { name: 'Dir Client', role: 'client' });
  users.plainClient = await make('plainClient', { name: 'Dir Plain', role: 'client', experimentArm: 'plain' });
  users.other = await make('other', { name: 'Dir Other', role: 'client' });
  await db.UserSkill.create({ userId: users.proven.id, skillId: tailoring.id, provenance: 'work_earned', verificationStatus: 'verified' });
  await db.UserSkill.create({ userId: users.declared.id, skillId: tailoring.id });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  gigId = (
    await db.Gig.create({
      clientId: users.client.id, skillId: tailoring.id, title: 'Directory fixture', description: 'Fixture',
      budget: 20000, locationLat: -1.95, locationLng: 30.06, status: 'open',
    })
  ).id;
});

afterAll(async () => {
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('finding workers', () => {
  test('clients see workers ranked by trust, with what they need to choose and nothing private', async () => {
    const res = await search('client');
    expect(res.status).toBe(200);
    const names = res.body.workers.map((w: { name: string }) => w.name);
    expect(names.indexOf(`${tag} Proven`)).toBeLessThan(names.indexOf(`${tag} Declared`));
    const proven = res.body.workers[0];
    expect(proven).toMatchObject({ phoneVerified: true, emailVerified: false, area: 'Kicukiro' });
    expect(proven.skills[0].provenance).toBe('work_earned');
    expect(proven).not.toHaveProperty('phone');
    expect(proven).not.toHaveProperty('email');
  });

  test('filters: proven skills only, and available now', async () => {
    const proven = (await search('client', { proven: 'true', category: 'tailoring' })).body.workers.map((w: { name: string }) => w.name);
    expect(proven).toEqual([`${tag} Proven`]);
    const available = (await search('client', { available: 'true' })).body.workers.map((w: { name: string }) => w.name);
    expect(available).not.toContain(`${tag} Away`);
  });

  test('the research control arm is not shown how skills were proven', async () => {
    const res = await search('plainClient');
    expect(res.body.workers[0].skills[0].provenance).toBeNull();
  });

  test('workers do not browse other workers', async () => {
    expect((await request(app).get('/api/users/directory').set(as('proven'))).status).toBe(403);
  });
});

describe('inviting a worker to a gig', () => {
  test('the client offers their open gig; the worker gets a pending invitation', async () => {
    const res = await request(app).post(`/api/gigs/${gigId}/invite`).set(as('client')).send({ workerId: users.proven.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', origin: 'direct', workerId: users.proven.id });
    expect((await request(app).post(`/api/gigs/${gigId}/invite`).set(as('client')).send({ workerId: users.proven.id })).status).toBe(409);
  });

  test('not someone else’s gig, and not a worker who is away', async () => {
    expect((await request(app).post(`/api/gigs/${gigId}/invite`).set(as('other')).send({ workerId: users.declared.id })).status).toBe(404);
    expect((await request(app).post(`/api/gigs/${gigId}/invite`).set(as('client')).send({ workerId: users.away.id })).status).toBe(409);
  });

  test('the invited worker can accept, which asks the client to pay into escrow', async () => {
    const match = must(await db.Match.findOne({ where: { gigId, workerId: users.proven.id } }), 'match');
    const res = await request(app).put(`/api/matches/${match.id}/status`).set(as('proven')).send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(await db.Transaction.findOne({ where: { matchId: match.id } })).not.toBeNull();
  });
});
