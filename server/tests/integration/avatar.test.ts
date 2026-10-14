import fs from 'fs';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';

const stamp = Date.now();
const password = 'password123';
const email = `avatar-${stamp}@example.com`;
const otherEmail = `avatar-other-${stamp}@example.com`;
let token = '';
let otherToken = '';
let userId = '';

// The smallest valid JPEG and PNG headers are enough for the content check.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const AVATARS = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const onDisk = (url: string) => fs.existsSync(path.join(AVATARS, path.basename(url)));

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.User.create({ name: 'Avatar Owner', email, passwordHash, role: 'worker' });
  userId = user.id;
  await db.User.create({ name: 'Avatar Viewer', email: otherEmail, passwordHash, role: 'client' });
  token = (await request(app).post('/api/auth/login').send({ email, password })).body.token;
  otherToken = (await request(app).post('/api/auth/login').send({ email: otherEmail, password })).body.token;
});

afterAll(async () => {
  const user = await db.User.findByPk(userId);
  if (user?.avatarUrl) fs.rmSync(path.join(AVATARS, path.basename(user.avatarUrl)), { force: true });
  await db.User.destroy({ where: { email: [email, otherEmail] } });
  await db.sequelize.close();
});

const upload = (buf: Buffer, name: string, type: string) =>
  request(app)
    .post('/api/users/me/avatar')
    .set('Authorization', `Bearer ${token}`)
    .attach('avatar', buf, { filename: name, contentType: type });

describe('profile pictures', () => {
  test('a cropped picture is saved, served, and shown on the public profile', async () => {
    const res = await upload(JPEG, 'me.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toMatch(/^\/uploads\/avatars\/[0-9a-f-]+\.jpg$/);
    expect(onDisk(res.body.avatarUrl)).toBe(true);

    const served = await request(app).get(res.body.avatarUrl);
    expect(served.status).toBe(200);

    const pub = await request(app).get(`/api/users/${userId}`).set('Authorization', `Bearer ${otherToken}`);
    expect(pub.body.avatarUrl).toBe(res.body.avatarUrl);
  });

  test('a new picture replaces the old one, and the old file is removed', async () => {
    const before = (await db.User.findByPk(userId))!.avatarUrl!;
    const res = await upload(PNG, 'me.png', 'image/png');
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).not.toBe(before);
    await new Promise((r) => setTimeout(r, 50));
    expect(onDisk(before)).toBe(false);
  });

  test('a file that claims to be an image but is not is refused and not kept', async () => {
    const before = fs.readdirSync(AVATARS).length;
    const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'x.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.readdirSync(AVATARS).length).toBe(before);
  });

  test('other file types are refused', async () => {
    const res = await upload(Buffer.from('%PDF-1.4'), 'cv.pdf', 'application/pdf');
    expect(res.status).toBe(400);
  });

  test('a picture needs a signed-in user', async () => {
    const res = await request(app).post('/api/users/me/avatar').attach('avatar', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  test('removing the picture brings back the initials and deletes the file', async () => {
    const before = (await db.User.findByPk(userId))!.avatarUrl!;
    const res = await request(app).delete('/api/users/me/avatar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(onDisk(before)).toBe(false);
  });
});
