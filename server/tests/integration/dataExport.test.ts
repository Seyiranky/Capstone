import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const password = 'password123';
const email = `export-${stamp}@example.com`;
let token = '';

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  await db.User.create({ name: 'Export Person', email, passwordHash, role: 'client', bio: 'Bakery owner in Kimironko' });
  token = (await request(app).post('/api/auth/login').send({ email, password })).body.token;
});

afterAll(async () => {
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex');

describe('exporting your data', () => {
  test('as PDF: a downloadable report with the person’s own details', async () => {
    const res = await request(app)
      .get('/api/users/me/export.pdf')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('isoko-my-data.pdf');
    expect(res.headers['cache-control']).toBe('no-store');
    const pdf = (res.body as Buffer).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain(hexOf('Export Person'));
    expect(pdf).toContain(hexOf(email));
    expect(pdf).toContain(hexOf('Bakery owner in Kimironko'));
    expect(pdf).not.toContain('passwordHash');
  });

  test('as JSON: the same records, with no password hash', async () => {
    const res = await request(app).get('/api/users/me/export').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.email).toBe(email);
    expect(res.body.profile.passwordHash).toBeUndefined();
    expect(Array.isArray(res.body.gigsPosted)).toBe(true);
  });

  test('both need a signed-in user', async () => {
    expect((await request(app).get('/api/users/me/export.pdf')).status).toBe(401);
    expect((await request(app).get('/api/users/me/export')).status).toBe(401);
  });
});
