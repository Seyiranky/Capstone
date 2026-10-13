import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';
import { path } from '../../src/services/ussdService';

process.env.RANKED_INVITE_LIMIT = '0';
process.env.EXPLORATION_SLOTS = '0';

const stamp = Date.now();
const password = 'password123';
const phone = `+2507${String(stamp).slice(-8)}`;
const emails: Record<string, string> = {
  worker: `ussd-worker-${stamp}@example.com`,
  client: `ussd-client-${stamp}@example.com`,
};
const users: Record<string, InstanceType<typeof db.User>> = {};
const tokens: Record<string, string> = {};
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
let skillId: string;

const dial = (text: string, number = phone) =>
  request(app).post('/api/ussd/gateway').type('form').send({ sessionId: 's1', serviceCode: '*500#', phoneNumber: number, text });

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const skill = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill');
  skillId = skill.id;
  users.worker = await db.User.create({
    name: 'Ussd Worker', email: emails.worker, passwordHash, role: 'worker', phone, phoneVerifiedAt: new Date(),
  });
  users.client = await db.User.create({ name: 'Ussd Client', email: emails.client, passwordHash, role: 'client' });
  await db.UserSkill.create({ userId: users.worker.id, skillId });
  for (const key of Object.keys(emails)) {
    tokens[key] = (await request(app).post('/api/auth/login').send({ email: emails[key], password })).body.token;
  }
  await db.Gig.create({
    clientId: users.client.id, skillId, title: `Ussd hem job ${stamp}`, description: 'Fixture',
    budget: 9000, locationLat: -1.9889, locationLng: 30.1, status: 'open',
  });
});

afterAll(async () => {
  await db.Gig.destroy({ where: { clientId: users.client.id } });
  await db.User.destroy({ where: { email: Object.values(emails) } });
  await db.sequelize.close();
});

describe('reading the session', () => {
  test('0 steps back one choice', () => {
    expect(path('')).toEqual([]);
    expect(path('1*2')).toEqual(['1', '2']);
    expect(path('1*2*0*3')).toEqual(['1', '3']);
    expect(path('1*0')).toEqual([]);
  });
});

describe('who can use it', () => {
  test('a number not confirmed by any worker is turned away', async () => {
    const res = await dial('', '+250780000001');
    expect(res.text).toMatch(/^END .*not linked/);
  });

  test('the in-app simulator is only for signed-in workers, with digits only', async () => {
    expect((await request(app).post('/api/ussd/simulate').send({ text: '' })).status).toBe(401);
    expect((await request(app).post('/api/ussd/simulate').set(as('client')).send({ text: '' })).status).toBe(403);
    expect((await request(app).post('/api/ussd/simulate').set(as('worker')).send({ text: '1;drop' })).status).toBe(400);
  });
});

describe('the menus', () => {
  test('the first screen offers the four choices', async () => {
    const res = await dial('');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^CON Isoko Talents\n1\. Jobs for me/);
  });

  test('a worker finds a job in their trade and applies to it', async () => {
    const list = await dial('1');
    expect(list.text).toMatch(/^CON Jobs for you:\n1\. Ussd hem job/);
    expect((await dial('1*1')).text).toMatch(/9,000 RWF, Kicukiro\n1\. Apply/);
    expect((await dial('1*1*1')).text).toMatch(/^END Applied/);
    const app1 = await db.GigApplication.findOne({ where: { workerId: users.worker.id } });
    expect(app1?.status).toBe('pending');
  });

  test('the active job takes the completion code and pays out', async () => {
    const gig = await db.Gig.create({
      clientId: users.client.id, skillId, title: 'Ussd active job', description: 'Fixture',
      budget: 12000, locationLat: -1.95, locationLng: 30.06, status: 'open',
    });
    const match = await db.Match.create({ gigId: gig.id, workerId: users.worker.id });
    await request(app).put(`/api/matches/${match.id}/status`).set(as('worker')).send({ status: 'accepted' });
    const tx = must(await db.Transaction.findOne({ where: { matchId: match.id } }), 'tx');
    await request(app).post(`/api/transactions/${tx.id}/confirm`).set(as('client')).send({});
    const { completionCode } = must(await db.Match.scope('withCompletionCode').findByPk(match.id), 'match');

    expect((await dial('2')).text).toMatch(/12,000 RWF held\n1\. Enter completion code/);
    expect((await dial('2*1*0000')).text).toMatch(/^END Wrong code\. 4 tries left/);
    expect((await dial(`2*1*${completionCode}`)).text).toMatch(/^END Done! 12,000 RWF/);
    expect(must(await db.Match.findByPk(match.id), 'match').status).toBe('completed');
  });

  test('earnings come from the worker’s payouts', async () => {
    expect((await dial('3')).text).toMatch(/This month: 12,000 RWF\nAll time: 12,000 RWF\nPaid jobs: 1/);
  });

  test('the language can be switched to Kinyarwanda from the phone', async () => {
    expect((await dial('4')).text).toMatch(/^END Ururimi: Ikinyarwanda/);
    expect((await dial('')).text).toMatch(/^CON Isoko Talents\n1\. Akazi kanjye/);
    await dial('4');
  });

  test('the simulator shows the same screens', async () => {
    const res = await request(app).post('/api/ussd/simulate').set(as('worker')).send({ text: '3' });
    expect(res.body.screen).toMatch(/^END This month/);
  });
});
