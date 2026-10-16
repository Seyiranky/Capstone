import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import * as followUp from '../../src/services/applicationFollowUp';
import { jwtSecret } from '../../src/config/env';
import { must } from '../helpers/fixtures';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const users: Record<string, InstanceType<typeof db.User>> = {};
const as = (who: string) => ({
  Authorization: `Bearer ${jwt.sign({ id: users[who].id, role: users[who].role }, jwtSecret(), { expiresIn: '1h' })}`,
});
const HOUR = 3600 * 1000;
let skillId = '';

const openGig = async () =>
  db.Gig.create({
    clientId: users.client.id, skillId, title: `Follow-up fixture ${Math.random().toString(36).slice(2, 6)}`,
    description: 'Fixture', budget: 10000, locationLat: -1.95, locationLng: 30.06, status: 'open', openedAt: new Date(),
  });
const applyAs = async (gigId: string, who: string) =>
  must(await db.GigApplication.findByPk((await request(app).post('/api/gig-applications').set(as(who)).send({ gigId })).body.id), 'application');
// The sweep covers every open gig, so count only the notices about the gig in front of the test.
const countNotes = async (who: string, title: string, gigTitle: string) =>
  (await db.Notification.findAll({ where: { userId: users[who].id, title } })).filter((n) => n.body.includes(gigTitle)).length;

beforeAll(async () => {
  skillId = must(await db.Skill.findOne({ where: { parentId: null } }), 'skill').id;
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const [key, role] of [['client', 'client'], ['w1', 'worker'], ['w2', 'worker']] as const) {
    users[key] = await db.User.create({ name: `FollowUp ${key}`, email: `followup-${key}-${stamp}@example.com`, passwordHash, role });
  }
});

afterAll(async () => {
  await db.User.destroy({ where: { id: Object.values(users).map((u) => u.id) } });
  await db.sequelize.close();
});

describe('reminders and expiry', () => {
  test('nothing happens before 48 hours', async () => {
    const gig = await openGig();
    await applyAs(gig.id, 'w1');
    await followUp.sweep(undefined, new Date(Date.now() + 47 * HOUR));
    expect(await countNotes('client', 'Applicants are waiting', gig.title)).toBe(0);
  });

  test('after 48 hours the client is reminded once, about all the applicants on the gig', async () => {
    const gig = await openGig();
    const a1 = await applyAs(gig.id, 'w1');
    await applyAs(gig.id, 'w2');
    const later = new Date(Date.now() + 49 * HOUR);
    await followUp.sweep(undefined, later);
    await followUp.sweep(undefined, later);
    expect(await countNotes('client', 'Applicants are waiting', gig.title)).toBe(1);
    const notes = await db.Notification.findAll({ where: { userId: users.client.id, title: 'Applicants are waiting' } });
    expect(notes.find((n) => n.body.includes(gig.title))?.body).toContain('2 workers');
    expect(must(await a1.reload(), 'a1').remindedAt).toBeTruthy();
  });

  test('after 7 days an unanswered application expires and the worker is told', async () => {
    const gig = await openGig();
    const a1 = await applyAs(gig.id, 'w1');
    await followUp.sweep(undefined, new Date(Date.now() + 7 * 24 * HOUR + HOUR));
    await a1.reload();
    expect(a1.status).toBe('expired');
    expect(a1.expiredAt).toBeTruthy();
    expect(await countNotes('w1', 'Application expired', gig.title)).toBe(1);
    // An expired application cannot be decided any more, and says why if re-sent.
    expect((await request(app).put(`/api/gig-applications/${a1.id}/review`).set(as('client')).send({ decision: 'approved' })).status).toBe(409);
    const again = await request(app).post('/api/gig-applications').set(as('w1')).send({ gigId: gig.id });
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('expired');
  });

  test('applications to a gig no longer open are left alone', async () => {
    const gig = await openGig();
    const a1 = await applyAs(gig.id, 'w1');
    await gig.update({ status: 'matched' });
    await followUp.sweep(undefined, new Date(Date.now() + 8 * 24 * HOUR));
    expect((await a1.reload()).status).toBe('pending');
  });

  test('answered applications are never reminded or expired', async () => {
    const gig = await openGig();
    const a1 = await applyAs(gig.id, 'w1');
    await request(app).put(`/api/gig-applications/${a1.id}/review`).set(as('client')).send({ decision: 'rejected', reason: 'timing' });
    await followUp.sweep(undefined, new Date(Date.now() + 8 * 24 * HOUR));
    expect((await a1.reload()).status).toBe('rejected');
  });
});
