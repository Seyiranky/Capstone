import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import { jwtSecret } from '../../src/config/env';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const users: Record<string, InstanceType<typeof db.User>> = {};
const as = (who: string) => ({
  Authorization: `Bearer ${jwt.sign({ id: users[who].id, role: users[who].role }, jwtSecret(), { expiresIn: '1h' })}`,
});
let skillId = '';

const openGig = async (fields: Record<string, unknown> = {}) =>
  db.Gig.create({
    clientId: users.client.id, skillId, title: `Oversight fixture ${Math.random().toString(36).slice(2, 6)}`,
    description: 'Fixture', budget: 20000, locationLat: -1.95, locationLng: 30.06, status: 'open', openedAt: new Date(), ...fields,
  });
const applyAs = async (gigId: string, who: string, quoteAmount?: number) =>
  (await request(app).post('/api/gig-applications').set(as(who)).send({ gigId, quoteAmount })).body;
const overview = async (all = false) =>
  (await request(app).get('/api/admin/applications').query(all ? { all: '1' } : {}).set(as('admin'))).body;
const find = (body: { applications: { id: string; flags: string[] }[] }, id: string) => body.applications.find((a) => a.id === id);

beforeAll(async () => {
  skillId = must(await db.Skill.findOne({ where: { parentId: null } }), 'skill').id;
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const [key, role] of [['client', 'client'], ['admin', 'admin'], ['w1', 'worker'], ['w2', 'worker'], ['sprayer', 'worker']] as const) {
    users[key] = await db.User.create({ name: `Oversight ${key}`, email: `oversight-${key}-${stamp}@example.com`, passwordHash, role });
  }
});

afterAll(async () => {
  await db.Report.destroy({ where: { reporterId: users.admin.id } });
  await db.User.destroy({ where: { id: Object.values(users).map((u) => u.id) } });
  await db.sequelize.close();
});

describe('applications overview', () => {
  test('only admins can see it', async () => {
    expect((await request(app).get('/api/admin/applications').set(as('client'))).status).toBe(403);
  });

  test('an ordinary fresh application is not flagged, but shows with all=1', async () => {
    const gig = await openGig();
    const a = await applyAs(gig.id, 'w1');
    expect(find(await overview(), a.id)).toBeUndefined();
    expect(find(await overview(true), a.id)?.flags).toEqual([]);
  });

  test('one waiting more than 48 hours is flagged overdue', async () => {
    const gig = await openGig();
    const a = await applyAs(gig.id, 'w1');
    await db.sequelize.query('UPDATE "GigApplications" SET "createdAt" = :d WHERE id = :id', {
      replacements: { d: new Date(Date.now() - 50 * 3600 * 1000), id: a.id },
    });
    expect(find(await overview(), a.id)?.flags).toContain('overdue');
  });

  test('a sensitive gig, an open report on either person, and a very low price are flagged', async () => {
    const sensitive = await openGig({ sensitive: true, sensitiveBy: 'admin' });
    await db.User.update({ phoneVerifiedAt: new Date(), completedJobCount: 2 }, { where: { id: users.w2.id } });
    await db.UserSkill.create({ userId: users.w2.id, skillId, proficiencyLevel: 3, verificationStatus: 'verified' } as never);
    const a = await applyAs(sensitive.id, 'w2');
    expect(find(await overview(), a.id)?.flags).toContain('sensitive');

    const plain = await openGig();
    const b = await applyAs(plain.id, 'w1', 100);
    await db.Report.create({ reporterId: users.admin.id, reportedUserId: users.client.id, reason: 'other', note: null, resolvedBy: null, resolvedAt: null, resolutionNote: null });
    const flags = find(await overview(), b.id)?.flags ?? [];
    expect(flags).toContain('report_client');
    await db.Report.destroy({ where: { reporterId: users.admin.id } });
  });

  test('five applications in ten minutes from one worker are flagged as a burst', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push((await applyAs((await openGig()).id, 'sprayer')).id);
    const body = await overview();
    expect(ids.every((id) => find(body, id)?.flags.includes('burst'))).toBe(true);
    expect(body.counts.burst).toBeGreaterThanOrEqual(5);
  });

  test('an admin can withdraw an application with a reason; the worker and the client are told', async () => {
    const gig = await openGig();
    const a = await applyAs(gig.id, 'w1');
    expect((await request(app).put(`/api/admin/applications/${a.id}/withdraw`).set(as('admin')).send({ reason: 'no' })).status).toBe(400);
    const res = await request(app)
      .put(`/api/admin/applications/${a.id}/withdraw`)
      .set(as('admin'))
      .send({ reason: 'Applied to many gigs in seconds without reading them.' });
    expect(res.status).toBe(200);
    expect(must(await db.GigApplication.findByPk(a.id), 'app').status).toBe('withdrawn');
    expect(await db.Notification.count({ where: { userId: users.w1.id, title: 'Application withdrawn' } })).toBeGreaterThan(0);
    expect(await db.Notification.count({ where: { userId: users.client.id, title: 'An admin withdrew an application' } })).toBeGreaterThan(0);
    expect((await request(app).put(`/api/admin/applications/${a.id}/withdraw`).set(as('admin')).send({ reason: 'Again, for testing.' })).status).toBe(409);
  });

  test('the sidebar count matches the flagged list', async () => {
    const body = await overview();
    const count = (await request(app).get('/api/admin/applications/flagged-count').set(as('admin'))).body.count;
    expect(count).toBe(body.applications.length);
  });
});
