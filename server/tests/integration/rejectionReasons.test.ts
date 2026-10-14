import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `reject-worker-${stamp}@example.com`,
  other: `reject-other-${stamp}@example.com`,
  client: `reject-client-${stamp}@example.com`,
  admin: `reject-admin-${stamp}@example.com`,
};

let skill: InstanceType<typeof db.Skill>;
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const openGig = () =>
  db.Gig.create({
    clientId: users.client.id,
    skillId: skill.id,
    title: `Reject fixture ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture',
    budget: 10000,
    locationLat: -1.95,
    locationLng: 30.06,
    status: 'open',
  });

const apply = async (gigId: string, who = 'worker') =>
  (await request(app).post('/api/gig-applications').set(as(who)).send({ gigId })).body.id as string;

beforeAll(async () => {
  skill = must(await db.Skill.findOne({ where: { category: 'digital_web', parentId: null } }), 'skill');
  const passwordHash = await bcrypt.hash(password, 10);
  users.worker = await db.User.create({ name: 'Reject Worker', email: emails.worker, passwordHash, role: 'worker' });
  users.other = await db.User.create({ name: 'Reject Other', email: emails.other, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Reject Client', email: emails.client, passwordHash, role: 'client' });
  users.admin = await db.User.create({ name: 'Reject Admin', email: emails.admin, passwordHash, role: 'admin' });
  for (const key of Object.keys(emails)) {
    const res = await request(app).post('/api/auth/login').send({ email: emails[key], password });
    tokens[key] = res.body.token;
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('rejection reasons', () => {
  test('a rejection without a reason is refused', async () => {
    const id = await apply((await openGig()).id);
    const res = await request(app).put(`/api/gig-applications/${id}/review`).set(as('admin')).send({ decision: 'rejected' });
    expect(res.status).toBe(400);
  });

  test('the worker is told why, with a next step for a skill gap', async () => {
    const gig = await openGig();
    const id = await apply(gig.id);
    const res = await request(app)
      .put(`/api/gig-applications/${id}/review`)
      .set(as('admin'))
      .send({ decision: 'rejected', reason: 'skillLevel', note: 'Needs e-commerce experience' });
    expect(res.status).toBe(200);
    const application = must(await db.GigApplication.findByPk(id), 'application');
    expect(application.rejectionReason).toBe('skillLevel');
    expect(application.rejectionNote).toBe('Needs e-commerce experience');

    const notice = await db.Notification.findOne({
      where: { userId: users.worker.id, title: 'Application not selected' },
      order: [['createdAt', 'DESC']],
    });
    expect(notice?.body).toContain('Verifying this skill');

    const mine = await request(app).get('/api/gig-applications').set(as('worker'));
    expect(mine.body.find((a: { id: string }) => a.id === id).rejectionReason).toBe('skillLevel');
  });

  test('when the gig is filled, the other applicants are told someone else was chosen', async () => {
    const gig = await openGig();
    const chosen = await apply(gig.id, 'worker');
    const sibling = await apply(gig.id, 'other');
    const approved = await request(app)
      .put(`/api/gig-applications/${chosen}/review`)
      .set(as('admin'))
      .send({ decision: 'approved' });
    await request(app).put(`/api/matches/${approved.body.match.id}/status`).set(as('worker')).send({ status: 'accepted' });
    expect(must(await db.GigApplication.findByPk(sibling), 'sibling').rejectionReason).toBe('choseAnother');
  });

  test('admins see the reasons counted by skill', async () => {
    const res = await request(app).get('/api/admin/rejection-reasons').set(as('admin'));
    expect(res.status).toBe(200);
    const row = res.body.find((r: { skill: string }) => r.skill === skill.name);
    expect(row.counts.skillLevel).toBeGreaterThanOrEqual(1);
    expect(row.counts.choseAnother).toBeGreaterThanOrEqual(1);
  });

  test("an admin's reason for rejecting a gig reaches the client", async () => {
    const gig = await openGig();
    await gig.update({ status: 'pending_review' });
    const res = await request(app)
      .put(`/api/admin/gigs/${gig.id}/review`)
      .set(as('admin'))
      .send({ decision: 'rejected', note: 'Budget too low for 20 uniforms' });
    expect(res.status).toBe(200);
    const notice = await db.Notification.findOne({
      where: { userId: users.client.id, title: 'Gig rejected' },
      order: [['createdAt', 'DESC']],
    });
    expect(notice?.body).toContain('Budget too low for 20 uniforms');
  });

  test('admins can see payments by state and the usual rates per trade', async () => {
    const payments = await request(app).get('/api/admin/payments').set(as('admin'));
    expect(payments.status).toBe(200);
    expect(Array.isArray(payments.body.recent)).toBe(true);
    expect(payments.body.totals).toHaveProperty('awaiting');
    expect(payments.body.provider.name).toBe('simulated-momo');
    const rates = await request(app).get('/api/admin/rates').set(as('admin'));
    expect(rates.status).toBe(200);
    expect(rates.body.map((r: { category: string }) => r.category)).toEqual(
      expect.arrayContaining(['digital_web', 'tailoring', 'tutoring', 'electronics_repair']),
    );
    const forbidden = await request(app).get('/api/admin/payments').set(as('client'));
    expect(forbidden.status).toBe(403);
  });
});
