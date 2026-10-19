import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import { jwtSecret } from '../../src/config/env';
import { looksSensitive } from '../../src/lib/sensitiveGig';
import { canApply } from '../../src/services/applicationEligibility';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const keys = ['client', 'otherClient', 'admin', 'newWorker', 'provenWorker', 'reportedWorker'] as const;
const users: Record<string, InstanceType<typeof db.User>> = {};
const as = (who: string) => ({
  Authorization: `Bearer ${jwt.sign({ id: users[who].id, role: users[who].role }, jwtSecret(), { expiresIn: '1h' })}`,
});
let skill: InstanceType<typeof db.Skill>;

const postGig = async (fields: Record<string, unknown> = {}) => {
  const res = await request(app).post('/api/gigs').set(as('client')).send({
    title: `Rules fixture ${Math.random().toString(36).slice(2, 6)}`,
    description: 'Paint a small office wall in two colours.',
    budget: 20000, skillId: skill.id, locationLat: -1.95, locationLng: 30.06, ...fields,
  });
  expect(res.status).toBe(201);
  await request(app).put(`/api/admin/gigs/${res.body.id}/review`).set(as('admin')).send({ decision: 'approved' });
  return must(await db.Gig.findByPk(res.body.id), 'gig');
};
const apply = (gigId: string, who: string) => request(app).post('/api/gig-applications').set(as(who)).send({ gigId });

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const key of keys) {
    users[key] = await db.User.create({
      name: `Rules ${key}`, email: `rules-${key}-${stamp}@example.com`, passwordHash,
      role: key === 'admin' ? 'admin' : key.toLowerCase().includes('client') ? 'client' : 'worker',
    });
  }
  // A worker with a reviewed skill in the trade, a confirmed phone and a paid job.
  await users.provenWorker.update({ phoneVerifiedAt: new Date(), completedJobCount: 2 });
  await db.UserSkill.create({ userId: users.provenWorker.id, skillId: skill.id, proficiencyLevel: 3, verificationStatus: 'verified' } as never);
  await db.Report.create({ reporterId: users.client.id, reportedUserId: users.reportedWorker.id, reason: 'no_show', note: null, resolvedBy: null, resolvedAt: null, resolutionNote: null });
});

afterAll(async () => {
  await db.Report.destroy({ where: { reportedUserId: users.reportedWorker.id } });
  await db.User.destroy({ where: { id: keys.map((k) => users[k].id) } });
  await db.sequelize.close();
});

describe('the client decides', () => {
  test('applying tells the gig’s client, not every admin', async () => {
    const gig = await postGig();
    expect((await apply(gig.id, 'newWorker')).status).toBe(201);
    expect(await db.Notification.count({ where: { userId: users.client.id, title: 'New gig application' } })).toBeGreaterThan(0);
    expect(await db.Notification.count({ where: { userId: users.admin.id, title: 'New gig application' } })).toBe(0);
  });

  test('the gig’s client approves; another client or a worker cannot', async () => {
    const gig = await postGig();
    const app1 = (await apply(gig.id, 'newWorker')).body;
    expect((await request(app).put(`/api/gig-applications/${app1.id}/review`).set(as('otherClient')).send({ decision: 'approved' })).status).toBe(403);
    expect((await request(app).put(`/api/gig-applications/${app1.id}/review`).set(as('newWorker')).send({ decision: 'approved' })).status).toBe(403);
    const res = await request(app).put(`/api/gig-applications/${app1.id}/review`).set(as('client')).send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.match.status).toBe('pending');
  });

  test('an admin can still step in, and the client is told', async () => {
    const gig = await postGig();
    const app1 = (await apply(gig.id, 'newWorker')).body;
    const res = await request(app).put(`/api/gig-applications/${app1.id}/review`).set(as('admin')).send({ decision: 'rejected', reason: 'timing' });
    expect(res.status).toBe(200);
    expect(await db.Notification.count({ where: { userId: users.client.id, title: 'An admin decided an application' } })).toBeGreaterThan(0);
  });
});

describe('who may apply', () => {
  test('a worker with an open report against them cannot apply, and is told why', async () => {
    const gig = await postGig();
    const res = await apply(gig.id, 'reportedWorker');
    expect(res.status).toBe(403);
    expect(res.body.missing).toEqual(['open_report']);
  });

  test('with the contact gate on, an unconfirmed worker is refused', async () => {
    const gig = await postGig();
    process.env.CONTACT_GATE_IN_TESTS = '1';
    try {
      const res = await request(app).get('/api/gig-applications/eligibility').query({ gigId: gig.id }).set(as('newWorker'));
      expect(res.body.missing).toContain('contact_unconfirmed');
    } finally {
      delete process.env.CONTACT_GATE_IN_TESTS;
    }
  });
});

describe('sensitive gigs', () => {
  test('words about children or a home mark a gig sensitive; ordinary ones do not', () => {
    expect(looksSensitive('English tutoring for my daughter', 'Twice a week after school')).toBe(true);
    expect(looksSensitive('Cleaner needed', 'Weekly cleaning inside my house')).toBe(true);
    expect(looksSensitive('Umwarimu', "Gufasha abana mu masomo")).toBe(true);
    expect(looksSensitive('Season promo poster', 'Kidney-shaped logo for a clinic')).toBe(false);
  });

  test('posting with those words, or ticking the box, marks the gig; an admin can change it', async () => {
    const byWords = await postGig({ title: 'Maths help for my son', description: 'Homework support after school.' });
    expect(byWords).toMatchObject({ sensitive: true, sensitiveBy: 'keywords' });
    const byTick = await postGig({ sensitive: true });
    expect(byTick).toMatchObject({ sensitive: true, sensitiveBy: 'client' });
    const plain = await postGig();
    expect(plain.sensitive).toBe(false);
    await request(app).put(`/api/admin/gigs/${plain.id}/sensitive`).set(as('admin')).send({ sensitive: true });
    expect(must(await db.Gig.findByPk(plain.id), 'gig')).toMatchObject({ sensitive: true, sensitiveBy: 'admin' });
  });

  test('a new worker is told everything they still need; a proven worker can apply', async () => {
    const gig = await postGig({ sensitive: true });
    const check = await request(app).get('/api/gig-applications/eligibility').query({ gigId: gig.id }).set(as('newWorker'));
    expect(check.body).toMatchObject({ eligible: false, sensitive: true });
    expect(check.body.missing).toEqual(expect.arrayContaining(['sensitive_skill', 'sensitive_phone', 'sensitive_record']));
    expect((await apply(gig.id, 'newWorker')).status).toBe(403);
    expect((await apply(gig.id, 'provenWorker')).status).toBe(201);
  });
});

describe('invitations follow the same rules', () => {
  test('automatic invitations to a sensitive gig go only to workers who could apply', async () => {
    process.env.RANKED_INVITE_LIMIT = '10';
    try {
      const gig = await postGig({ sensitive: true });
      const invited = await db.Match.findAll({ where: { gigId: gig.id, origin: 'ranked' } });
      for (const m of invited) {
        const worker = must(await db.User.findByPk(m.workerId), 'worker');
        expect((await canApply(gig, worker)).eligible).toBe(true);
      }
      expect(invited.some((m) => m.workerId === users.newWorker.id)).toBe(false);
    } finally {
      process.env.RANKED_INVITE_LIMIT = '0';
    }
  });

  test('an invitation cannot be accepted by someone who no longer qualifies', async () => {
    const gig = await postGig();
    const match = await db.Match.create({ gigId: gig.id, workerId: users.newWorker.id, status: 'pending', origin: 'ranked' } as never);
    await request(app).put(`/api/admin/gigs/${gig.id}/sensitive`).set(as('admin')).send({ sensitive: true });
    const res = await request(app).put(`/api/matches/${match.id}/status`).set(as('newWorker')).send({ status: 'accepted' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ELIGIBLE');
  });
});

describe('approving checks the rules too', () => {
  test('an applicant who no longer qualifies (the gig was marked sensitive after they applied) cannot be approved', async () => {
    const gig = await postGig();
    const application = (await apply(gig.id, 'newWorker')).body;
    await request(app).put(`/api/admin/gigs/${gig.id}/sensitive`).set(as('admin')).send({ sensitive: true });
    const res = await request(app).put(`/api/gig-applications/${application.id}/review`).set(as('client')).send({ decision: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ELIGIBLE');
    // Turning it down still works.
    expect((await request(app).put(`/api/gig-applications/${application.id}/review`).set(as('client')).send({ decision: 'rejected', reason: 'skillLevel' })).status).toBe(200);
  });
});
