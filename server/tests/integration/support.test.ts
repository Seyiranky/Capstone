import fs from 'fs';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import db from '../../src/models';
import * as supportService from '../../src/services/supportService';
import { jwtSecret } from '../../src/config/env';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const password = 'password123';
const emails: Record<string, string> = {
  worker: `support-worker-${stamp}@example.com`,
  client: `support-client-${stamp}@example.com`,
  other: `support-other-${stamp}@example.com`,
  admin: `support-admin-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const as = (who: string) => ({
  Authorization: `Bearer ${jwt.sign({ id: users[who].id, role: users[who].role }, jwtSecret(), { expiresIn: '1h' })}`,
});
const guestEmail = `support-guest-${stamp}@example.com`;
let matchId = '';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  for (const [key, email] of Object.entries(emails)) {
    users[key] = await db.User.create({
      name: `Support ${key}`,
      email,
      passwordHash,
      role: key === 'admin' ? 'admin' : key === 'worker' ? 'worker' : 'client',
    });
  }
  const skill = must(await db.Skill.findOne({ where: { parentId: null } }), 'skill');
  const gig = await db.Gig.create({
    clientId: users.client.id, skillId: skill.id, title: 'Support fixture gig', description: 'Fixture',
    budget: 20000, locationLat: -1.95, locationLng: 30.06, status: 'matched',
  });
  matchId = (await db.Match.create({ gigId: gig.id, workerId: users.worker.id, status: 'accepted', acceptedAt: new Date() })).id;
});

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  const tickets = await db.SupportTicket.findAll({ where: { userId: ids } });
  const guest = await db.SupportTicket.findAll({ where: { guestEmail } });
  const all = [...tickets, ...guest].map((t) => t.id);
  const files = await db.SupportMessage.findAll({ where: { ticketId: all } });
  for (const m of files) {
    if (m.attachmentUrl) fs.rmSync(path.join(__dirname, '..', '..', m.attachmentUrl), { force: true });
  }
  await db.SupportTicket.destroy({ where: { id: all } });
  await db.Report.destroy({ where: { reporterId: ids } });
  await db.Dispute.destroy({ where: { matchId } });
  await db.Match.destroy({ where: { id: matchId } });
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { id: ids } });
  await db.sequelize.close();
});

const open = (who: string, body: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/support/tickets')
    .set(as(who))
    .send({ category: 'payment', subject: 'The MoMo prompt never came', body: 'I pressed Pay twice and nothing reached my phone.', ...body });

describe('people asking for help', () => {
  test('a request gets a reference, a received note, and payment requests start as high priority', async () => {
    const res = await open('client', { relatedType: 'match', relatedId: matchId, context: { path: '/marketplace', language: 'en' } });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^SUP-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(res.body.priority).toBe('high');
    expect(res.body.related).toMatchObject({ type: 'match', title: 'Support fixture gig' });
    expect(res.body.messages.map((m: { authorRole: string }) => m.authorRole)).toEqual(['user', 'system']);
    expect(res.body.guestTokenHash).toBeUndefined();
  });

  test('safety requests start as urgent', async () => {
    const res = await open('worker', { category: 'safety', subject: 'Unsafe visit', body: 'The client was aggressive when I arrived.' });
    expect(res.body.priority).toBe('urgent');
  });

  test('a job, payment or skill can be attached only if it is the person’s own', async () => {
    const res = await open('other', { relatedType: 'match', relatedId: matchId });
    expect(res.status).toBe(400);
  });

  test('a request needs a category and more than a few words', async () => {
    expect((await open('client', { category: 'nonsense' })).status).toBe(400);
    expect((await open('client', { body: 'help' })).status).toBe(400);
  });

  test('people see only their own requests', async () => {
    const mine = await request(app).get('/api/support/tickets').set(as('client'));
    expect(mine.body.length).toBeGreaterThan(0);
    const id = mine.body[0].id;
    expect((await request(app).get(`/api/support/tickets/${id}`).set(as('other'))).status).toBe(404);
    expect((await request(app).post(`/api/support/tickets/${id}/messages`).set(as('other')).send({ body: 'hi' })).status).toBe(404);
  });

  test('no more than five open requests at once', async () => {
    for (let i = 0; i < 5; i += 1) await open('other', { category: 'other', subject: `Q${i}` });
    const res = await open('other', { category: 'other' });
    expect(res.status).toBe(429);
  });

  test('a screenshot can be attached, and is served only through a signed link', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .set(as('worker'))
      .field('category', 'bug')
      .field('subject', 'Button does nothing')
      .field('body', 'The Save button on my profile does nothing when I press it.')
      .attach('attachment', PNG, { filename: 'screen.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const url: string = res.body.messages[0].attachmentUrl;
    expect(url).toMatch(/^\/uploads\/support\/.+\?exp=\d+&sig=/);
    expect((await request(app).get(url)).status).toBe(200);
    expect((await request(app).get(url.split('?')[0])).status).toBe(403);
  });

  test('a file pretending to be a picture is refused', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .set(as('worker'))
      .field('category', 'bug')
      .field('body', 'Here is a screenshot of the problem I am seeing.')
      .attach('attachment', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('the team answering', () => {
  let ticketId = '';

  beforeAll(async () => {
    const list = await request(app).get('/api/support/tickets').set(as('client'));
    ticketId = list.body.find((t: { category: string }) => t.category === 'payment').id;
  });

  test('admins see the inbox with figures; others cannot', async () => {
    const res = await request(app).get('/api/support/admin/tickets').set(as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.tickets.some((t: { id: string }) => t.id === ticketId)).toBe(true);
    expect(res.body.metrics).toHaveProperty('open');
    expect((await request(app).get('/api/support/admin/tickets').set(as('client'))).status).toBe(403);
  });

  test('an internal note stays with the admins', async () => {
    await request(app).post(`/api/support/admin/tickets/${ticketId}/messages`).set(as('admin')).send({ body: 'Checked MTN: request expired.', internal: true });
    const admin = await request(app).get(`/api/support/admin/tickets/${ticketId}`).set(as('admin'));
    expect(admin.body.messages.some((m: { body: string }) => m.body === 'Checked MTN: request expired.')).toBe(true);
    expect(admin.body.person).toMatchObject({ id: users.client.id });
    const mine = await request(app).get(`/api/support/tickets/${ticketId}`).set(as('client'));
    expect(mine.body.messages.some((m: { body: string }) => m.body === 'Checked MTN: request expired.')).toBe(false);
  });

  test('a reply waits on the person, tells them, and records the first response time', async () => {
    const res = await request(app)
      .post(`/api/support/admin/tickets/${ticketId}/messages`)
      .set(as('admin'))
      .send({ body: 'Dial *182*7*1# to approve it.' });
    expect(res.status).toBe(201);
    const ticket = must(await db.SupportTicket.findByPk(ticketId), 'ticket');
    expect(ticket.status).toBe('waiting_on_user');
    expect(ticket.userUnread).toBe(true);
    expect(ticket.firstResponseAt).not.toBeNull();
    expect(ticket.assigneeId).toBe(users.admin.id);
    expect(await db.Notification.count({ where: { userId: users.client.id, title: 'Support replied' } })).toBe(1);
    // The person sees "Isoko Support", not which admin wrote.
    const mine = await request(app).get(`/api/support/tickets/${ticketId}`).set(as('client'));
    const fromTeam = mine.body.messages.find((m: { authorRole: string }) => m.authorRole === 'admin');
    expect(fromTeam.author).toBeNull();
  });

  test('the person replying puts it back with the team', async () => {
    await request(app).post(`/api/support/tickets/${ticketId}/messages`).set(as('client')).send({ body: 'That worked, thank you!' });
    const ticket = must(await db.SupportTicket.findByPk(ticketId), 'ticket');
    expect(ticket.status).toBe('open');
    expect(ticket.adminUnread).toBe(true);
  });

  test('resolved, rated "not helpful", it opens again', async () => {
    await request(app)
      .post(`/api/support/admin/tickets/${ticketId}/messages`)
      .set(as('admin'))
      .send({ body: 'Glad that is sorted.', status: 'resolved' });
    expect(must(await db.SupportTicket.findByPk(ticketId), 'ticket').status).toBe('resolved');
    const res = await request(app).post(`/api/support/tickets/${ticketId}/rate`).set(as('client')).send({ helpful: false });
    expect(res.body.status).toBe('open');
  });

  test('closing is final', async () => {
    await request(app).post(`/api/support/tickets/${ticketId}/close`).set(as('client'));
    const res = await request(app).post(`/api/support/tickets/${ticketId}/messages`).set(as('client')).send({ body: 'one more thing' });
    expect(res.status).toBe(409);
  });

  test('assigning only to admins, and the change is noted', async () => {
    const list = await request(app).get('/api/support/tickets').set(as('worker'));
    const id = list.body[0].id;
    expect((await request(app).put(`/api/support/admin/tickets/${id}`).set(as('admin')).send({ assigneeId: users.client.id })).status).toBe(400);
    expect((await request(app).put(`/api/support/admin/tickets/${id}`).set(as('admin')).send({ assigneeId: users.admin.id, priority: 'high' })).status).toBe(200);
    const thread = await request(app).get(`/api/support/admin/tickets/${id}`).set(as('admin'));
    expect(thread.body.messages.map((m: { systemKey: string }) => m.systemKey)).toEqual(expect.arrayContaining(['assigned', 'priority']));
  });

  test('a request about a job can become a report about the other person', async () => {
    const created = await open('client', { category: 'job', subject: 'Worker asked me to pay outside', body: 'The worker asked me to pay him directly on MoMo instead.', relatedType: 'match', relatedId: matchId });
    const res = await request(app).post(`/api/support/admin/tickets/${created.body.id}/escalate`).set(as('admin')).send({ to: 'report', reason: 'payment_outside' });
    expect(res.status).toBe(201);
    const report = must(await db.Report.findByPk(res.body.id), 'report');
    expect(report.reporterId).toBe(users.client.id);
    expect(report.reportedUserId).toBe(users.worker.id);
    expect((await request(app).post(`/api/support/admin/tickets/${created.body.id}/escalate`).set(as('admin')).send({ to: 'report' })).status).toBe(409);
  });

  test('saved replies can be added, used and removed', async () => {
    const made = await request(app).post('/api/support/admin/saved-replies').set(as('admin')).send({ title: `Test ${stamp}`, body: 'Hello {{name}}' });
    expect(made.status).toBe(201);
    const list = await request(app).get('/api/support/admin/saved-replies').set(as('admin'));
    expect(list.body.some((r: { id: string }) => r.id === made.body.id)).toBe(true);
    expect((await request(app).delete(`/api/support/admin/saved-replies/${made.body.id}`).set(as('admin'))).status).toBe(204);
  });
});

describe('people who cannot sign in', () => {
  test('a request by email, followed and answered through a private link', async () => {
    const res = await request(app).post('/api/support/guest').send({
      name: 'Locked Out', email: guestEmail, category: 'account', subject: 'Cannot sign in', body: 'My password reset email never arrives.',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();

    const ticket = must(await db.SupportTicket.findOne({ where: { guestEmail } }), 'guest ticket');
    expect(ticket.userId).toBeNull();
    // The link is what the email carries; build it the same way to follow it.
    const token = supportService.guestToken(ticket.id);
    const view = await request(app).get(`/api/support/guest/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.subject).toBe('Cannot sign in');

    const replied = await request(app).post(`/api/support/guest/${token}/messages`).send({ body: 'Still nothing in spam either.' });
    expect(replied.status).toBe(201);
  });

  test('one address may send only so many in a day (SUPPORT_GUEST_DAILY_LIMIT)', async () => {
    const address = `support-guest-limit-${stamp}@example.com`;
    const send = () =>
      request(app).post('/api/support/guest').send({
        name: 'Limit Check', email: address, category: 'account', subject: 'Cannot sign in', body: 'Trying again, sorry.',
      });
    process.env.SUPPORT_GUEST_DAILY_LIMIT = '2';
    try {
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      const third = await send();
      expect(third.status).toBe(429);
      expect(third.body.message).toMatch(/already have requests from this address/);
      // The default allows ten.
      delete process.env.SUPPORT_GUEST_DAILY_LIMIT;
      expect(supportService.guestDailyLimit()).toBe(10);
      expect((await send()).status).toBe(201);
    } finally {
      delete process.env.SUPPORT_GUEST_DAILY_LIMIT;
      await db.SupportTicket.destroy({ where: { guestEmail: address } });
    }
  });

  test('a link that was tampered with does not open anything', async () => {
    const ticket = must(await db.SupportTicket.findOne({ where: { guestEmail } }), 'guest ticket');
    expect((await request(app).get(`/api/support/guest/${ticket.id}.forged`)).status).toBe(404);
    expect((await request(app).get(`/api/support/guest/not-a-token`)).status).toBe(404);
  });

  test('a bot that fills the hidden field is told it worked, and nothing is saved', async () => {
    const before = await db.SupportTicket.count();
    const res = await request(app).post('/api/support/guest').send({ name: 'Bot', email: 'bot@example.com', category: 'other', body: 'Buy cheap things here now', website: 'http://spam' });
    expect(res.status).toBe(201);
    expect(await db.SupportTicket.count()).toBe(before);
  });
});

describe('housekeeping', () => {
  test('resolved requests nobody answers are closed after a week', async () => {
    const created = await open('worker', { category: 'other', subject: 'Old question', body: 'A question answered long ago and never closed.' });
    await db.SupportTicket.update(
      { status: 'resolved', resolvedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) },
      { where: { id: created.body.id } },
    );
    await supportService.autoClose();
    expect(must(await db.SupportTicket.findByPk(created.body.id), 'ticket').status).toBe('closed');
  });
});
