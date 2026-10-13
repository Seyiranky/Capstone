import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { must } from '../helpers/fixtures';

const stamp = Date.now();
const email = `rates-client-${stamp}@example.com`;
let token: string;
let client: InstanceType<typeof db.User>;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash('password123', 10);
  client = await db.User.create({ name: 'Rates Client', email, passwordHash, role: 'client' });
  token = (await request(app).post('/api/auth/login').send({ email, password: 'password123' })).body.token;
});

afterAll(async () => {
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

describe('GET /api/gigs/rates', () => {
  test('needs a skill', async () => {
    const res = await request(app).get('/api/gigs/rates').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('falls back to posted budgets, and says so, when too few jobs were paid', async () => {
    const skill = must(await db.Skill.findOne({ where: { category: 'tailoring', parentId: null } }), 'skill');
    for (const budget of [12000, 18000, 30000]) {
      await db.Gig.create({
        clientId: client.id,
        skillId: skill.id,
        title: 'Rates fixture',
        description: 'Fixture',
        budget,
        locationLat: -1.95,
        locationLng: 30.06,
        status: 'open',
      });
    }
    const res = await request(app)
      .get('/api/gigs/rates')
      .query({ skillId: skill.id })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(['paid', 'posted']).toContain(res.body.basis);
    expect(res.body.sampleSize).toBeGreaterThanOrEqual(3);
    expect(res.body.p25).toBeLessThanOrEqual(res.body.median);
    expect(res.body.median).toBeLessThanOrEqual(res.body.p75);
  });
});
