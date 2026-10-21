import fs from 'fs';
import os from 'os';
import path from 'path';
import { UPLOAD_ROOT, keyFor, keyForUrl } from '../../src/lib/storage';
import { supabaseDriver } from '../../src/lib/storage/supabase';

describe('storage keys', () => {
  test('only "<folder>/<file>" under uploads/ becomes a key', () => {
    expect(keyFor(path.join(UPLOAD_ROOT, 'avatars', 'a1b2.jpg'))).toBe('avatars/a1b2.jpg');
    expect(keyFor(path.join(UPLOAD_ROOT, '..', 'package.json'))).toBeNull();
    expect(keyFor(path.join(UPLOAD_ROOT, 'avatars', 'x', 'y.jpg'))).toBeNull();
    expect(keyForUrl('/uploads/messages/abc.webm')).toBe('messages/abc.webm');
    expect(keyForUrl('/messages/abc.webm')).toBe('messages/abc.webm');
    expect(keyForUrl('/uploads/../.env')).toBeNull();
    expect(keyForUrl('/uploads/avatars/%2e%2e')).toBeNull();
  });
});

describe('the Supabase driver', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let reply: Response;
  let spy: jest.SpyInstance;

  beforeAll(() => {
    spy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return reply.clone();
    });
  });
  afterAll(() => spy.mockRestore());
  beforeEach(() => {
    calls.length = 0;
    process.env.SUPABASE_URL = 'https://proj.supabase.co/';
    process.env.SUPABASE_BUCKET = 'uploads';
  });

  test('saves a file to the private bucket, overwriting, with the new kind of key in apikey only', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'sb_secret_abc';
    const file = path.join(os.tmpdir(), `isoko-storage-${Date.now()}.jpg`);
    fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff]));
    reply = new Response('{}', { status: 200 });
    await supabaseDriver.save('avatars/a.jpg', file, 'image/jpeg');
    fs.rmSync(file);
    expect(calls[0].url).toBe('https://proj.supabase.co/storage/v1/object/uploads/avatars/a.jpg');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_abc');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-upsert']).toBe('true');
    expect(Buffer.from(calls[0].init.body as Uint8Array)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  test('a legacy service-role key (a JWT) also goes in Authorization', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOi.legacy';
    reply = new Response('missing', { status: 404 });
    expect(await supabaseDriver.read('evidence/none.png')).toBeNull();
    expect(calls[0].url).toBe('https://proj.supabase.co/storage/v1/object/authenticated/uploads/evidence/none.png');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer eyJhbGciOi.legacy');
  });

  test('reads a file back with its type, and removes by key', async () => {
    process.env.SUPABASE_SERVICE_KEY = 'sb_secret_abc';
    reply = new Response(Buffer.from('voice'), { status: 200, headers: { 'content-type': 'audio/webm' } });
    const got = await supabaseDriver.read('messages/v.webm');
    expect(got?.contentType).toBe('audio/webm');
    expect(got?.body.toString()).toBe('voice');

    reply = new Response('[]', { status: 200 });
    await supabaseDriver.remove('avatars/a.jpg');
    expect(calls[1].init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ prefixes: ['avatars/a.jpg'] });
  });

  test('refuses to run without its settings', async () => {
    delete process.env.SUPABASE_SERVICE_KEY;
    await expect(supabaseDriver.read('avatars/a.jpg')).rejects.toThrow(/SUPABASE_URL and SUPABASE_SERVICE_KEY/);
  });
});
