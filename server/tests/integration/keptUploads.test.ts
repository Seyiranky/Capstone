import fs from 'fs';
import path from 'path';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../../src/app';
import db from '../../src/models';
import { UPLOAD_ROOT } from '../../src/lib/storage';

// With STORAGE_DRIVER=supabase (Supabase's API faked here), an accepted upload
// is copied to the bucket, a rejected one is not, and a file that has gone from
// the server's disk (as on a free host after a redeploy) is served from the bucket.

const stamp = Date.now();
const email = `kept-${stamp}@example.com`;
const password = 'password123';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const bucket = new Map<string, { body: Buffer; type: string }>();
let token: string;
let fetchSpy: jest.SpyInstance;

const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  Object.assign(process.env, {
    STORAGE_DRIVER: 'supabase',
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SERVICE_KEY: 'sb_secret_test',
  });
  const realFetch = global.fetch;
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://proj.supabase.co/')) return realFetch(input, init);
    const key = url.split('/storage/v1/object/')[1].replace(/^authenticated\//, '').replace(/^uploads\//, '');
    if (init?.method === 'POST') {
      bucket.set(key, { body: Buffer.from(init.body as Uint8Array), type: String((init.headers as Record<string, string>)['Content-Type']) });
      return new Response('{}', { status: 200 });
    }
    if (init?.method === 'DELETE') {
      for (const k of JSON.parse(String(init.body)).prefixes) bucket.delete(k);
      return new Response('[]', { status: 200 });
    }
    const hit = bucket.get(key);
    return hit ? new Response(hit.body, { status: 200, headers: { 'content-type': hit.type } }) : new Response('', { status: 404 });
  });
  await db.User.create({ name: 'Kept Uploads', email, passwordHash: await bcrypt.hash(password, 10), role: 'worker' });
  token = (await request(app).post('/api/auth/login').send({ email, password })).body.token;
});

afterAll(async () => {
  fetchSpy.mockRestore();
  for (const k of ['STORAGE_DRIVER', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
  await db.User.destroy({ where: { email } });
  await db.sequelize.close();
});

const upload = (buf: Buffer, type: string) =>
  request(app).post('/api/users/me/avatar').set('Authorization', `Bearer ${token}`).attach('avatar', buf, { filename: 'me.jpg', contentType: type });

test('an accepted upload is copied to the bucket, and served from it once gone from disk', async () => {
  const res = await upload(JPEG, 'image/jpeg');
  expect(res.status).toBe(200);
  const url: string = res.body.avatarUrl;
  await settle();
  const key = url.replace('/uploads/', '');
  expect(bucket.get(key)?.body).toEqual(JPEG);

  fs.rmSync(path.join(UPLOAD_ROOT, key)); // the host was redeployed
  const served = await request(app).get(url);
  expect(served.status).toBe(200);
  expect(served.headers['content-type']).toBe('image/jpeg');
  expect(Buffer.from(served.body)).toEqual(JPEG);
  await settle();
  expect(fs.existsSync(path.join(UPLOAD_ROOT, key))).toBe(true); // kept locally for next time

  // Removing the picture removes the kept copy too.
  await request(app).delete('/api/users/me/avatar').set('Authorization', `Bearer ${token}`);
  await settle();
  expect(bucket.has(key)).toBe(false);
});

test('a rejected upload is never copied', async () => {
  const before = bucket.size;
  const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg');
  expect(res.status).toBe(400);
  await settle();
  expect(bucket.size).toBe(before);
});

test('a path that is not an upload is never fetched from the bucket', async () => {
  const res = await request(app).get('/uploads/avatars/..%2f..%2fpackage.json');
  expect(res.status).toBe(404);
});
