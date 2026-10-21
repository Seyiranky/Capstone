import fs from 'fs/promises';
import type { StorageDriver, StoredFile } from './index';

/**
 * Supabase Storage, through its REST API (no SDK, so no new dependency).
 *
 * Configuration (server/.env, or the host's environment):
 *   SUPABASE_URL          https://<project>.supabase.co
 *   SUPABASE_SERVICE_KEY  the project's secret (service role) key; server-side only, never sent to a browser
 *   SUPABASE_BUCKET       a private bucket; defaults to "uploads"
 *
 * The bucket is private: files are only ever fetched by this server, after it
 * has checked the requester's signed link (lib/signedUploads.ts).
 */
const config = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for STORAGE_DRIVER=supabase');
  return { url, key, bucket: process.env.SUPABASE_BUCKET || 'uploads' };
};

/**
 * Supabase's legacy service-role key is a JWT and also goes in Authorization;
 * the newer "sb_secret_..." keys go in the apikey header only.
 */
const headers = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
  ...extra,
});

/** Each path segment encoded, the slash between folder and file kept. */
const objectPath = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export const supabaseDriver: StorageDriver = {
  name: 'supabase',

  async save(key, filePath, contentType) {
    const { url, key: secret, bucket } = config();
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath(key)}`, {
      method: 'POST',
      headers: headers(secret, { 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: await fs.readFile(filePath),
    });
    if (!res.ok) throw new Error(`Supabase refused the upload (${res.status})`);
  },

  async read(key): Promise<StoredFile | null> {
    const { url, key: secret, bucket } = config();
    const res = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${objectPath(key)}`, {
      headers: headers(secret),
    });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Supabase could not return the file (${res.status})`);
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  },

  async remove(key) {
    const { url, key: secret, bucket } = config();
    const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: headers(secret, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok) throw new Error(`Supabase could not remove the file (${res.status})`);
  },
};
