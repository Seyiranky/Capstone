import request from 'supertest';
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import * as teamService from '../../src/services/teamService';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

// Accepting a match changes the match, the gig, the other invitations and the
// other applications. These run in one transaction (matchStatusService), so a
// failure part-way leaves nothing half done, and two simultaneous acceptances
// cannot both take the same gig.

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  first: `tx-first-${stamp}@example.com`,
  second: `tx-second-${stamp}@example.com`,
  client: `tx-client-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

const gigWithTwoInvitations = async () => {
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId, title: `Tx job ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Fixture', budget: 15000, locationLat: -1.95, locationLng: 30.06, status: 'open',
  });
  const first = await db.Match.create({ gigId: gig.id, workerId: users.first.id });
  const second = await db.Match.create({ gigId: gig.id, workerId: users.second.id });
  return { gig, first, second };
};
const accept = (matchId: string, who: string) =>
  request(app).put(`/api/matches/${matchId}/status`).set(as(who)).send({ status: 'accepted' });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  skillId = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill').id;
  users.first = await db.User.create({ name: 'Tx First', email: emails.first, passwordHash, role: 'worker' });
  users.second = await db.User.create({ name: 'Tx Second', email: emails.second, passwordHash, role: 'worker' });
  users.client = await db.User.create({ name: 'Tx Client', email: emails.client, passwordHash, role: 'client' });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await db.Notification.destroy({ where: { userId: ids } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('accepting a match is all or nothing', () => {
  test('a failure part-way rolls every write back and sends no notices', async () => {
    const { gig, first, second } = await gigWithTwoInvitations();
    jest.spyOn(teamService, 'createCrewInvites').mockRejectedValueOnce(new Error('simulated failure'));

    expect((await accept(first.id, 'first')).status).toBe(500);

    expect(must(await db.Match.findByPk(first.id), 'first').status).toBe('pending');
    expect(must(await db.Match.findByPk(second.id), 'second').status).toBe('pending');
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('open');
    expect(await db.Notification.count({ where: { userId: users.client.id, title: 'Worker confirmed', body: { [Op.like]: `%${gig.title}%` } } })).toBe(0);

    // Nothing was left half done, so the same acceptance now succeeds.
    expect((await accept(first.id, 'first')).status).toBe(200);
    expect(must(await db.Match.findByPk(second.id), 'second').status).toBe('cancelled');
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('matched');
  });

  test('two workers accepting the same gig at once: exactly one wins', async () => {
    const { gig, first, second } = await gigWithTwoInvitations();

    const results = await Promise.all([accept(first.id, 'first'), accept(second.id, 'second')]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const taken = await db.Match.count({ where: { gigId: gig.id, status: 'accepted' } });
    expect(taken).toBe(1);
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('matched');
  });

  test('an ineligible worker still gets the NOT_ELIGIBLE code and what is missing', async () => {
    const { gig, first } = await gigWithTwoInvitations();
    // Marked sensitive after the invitation went out; the worker has no confirmed phone.
    await gig.update({ sensitive: true });

    const res = await accept(first.id, 'first');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ELIGIBLE');
    expect(res.body.missing).toContain('sensitive_phone');
    expect(must(await db.Match.findByPk(first.id), 'first').status).toBe('pending');
    expect(must(await db.Gig.findByPk(gig.id), 'gig').status).toBe('open');
  });
});
