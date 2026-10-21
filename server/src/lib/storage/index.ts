import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { localDriver } from './local';
import { supabaseDriver } from './supabase';

/**
 * Where uploaded files are kept for good.
 *
 * Uploads are first written to the server's own disk by multer, where every
 * check runs (type, size, content, hash) exactly as before. On a free host
 * that disk is wiped on every restart and redeploy, so a driver keeps the
 * lasting copy:
 *
 *   local     the files on disk are the files (development, Docker with a volume)
 *   supabase  each accepted file is copied to a private Supabase Storage bucket,
 *             and fetched back the first time it is asked for after a restart
 *
 * Chosen by STORAGE_DRIVER, like the payment, SMS and email drivers.
 */
export interface StoredFile {
  body: Buffer;
  contentType: string;
}

export interface StorageDriver {
  readonly name: string;
  /** Keeps the file at `filePath` under `key` (e.g. "avatars/<uuid>.jpg"). */
  save(key: string, filePath: string, contentType: string): Promise<void>;
  /** The file kept under `key`, or null if there is none. */
  read(key: string): Promise<StoredFile | null>;
  remove(key: string): Promise<void>;
}

const DRIVERS: Record<string, StorageDriver> = {
  [localDriver.name]: localDriver,
  [supabaseDriver.name]: supabaseDriver,
};

export const driver = (): StorageDriver => {
  const name = process.env.STORAGE_DRIVER || localDriver.name;
  const chosen = DRIVERS[name];
  if (!chosen) throw new Error(`Unknown STORAGE_DRIVER '${name}'. Available: ${Object.keys(DRIVERS).join(', ')}`);
  return chosen;
};

/** uploads/ sits beside src/ and dist/ alike, so this resolves the same under tsx and after a build. */
export const UPLOAD_ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

/**
 * A storage key for a path under uploads/, or null for anything else.
 * Keys are only ever "<folder>/<file>": no "..", no absolute paths.
 */
export const keyFor = (filePath: string): string | null => {
  const rel = path.relative(UPLOAD_ROOT, filePath).split(path.sep).join('/');
  return /^[a-z]+\/[A-Za-z0-9._-]+$/.test(rel) ? rel : null;
};

/** The key for an /uploads/... URL path, or null. */
export const keyForUrl = (urlPath: string): string | null => {
  const rel = urlPath.replace(/^\/+/, '').replace(/^uploads\//, '');
  return /^[a-z]+\/[A-Za-z0-9._-]+$/.test(rel) ? rel : null;
};

const filesOf = (req: Request): Express.Multer.File[] => {
  const files: Express.Multer.File[] = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files) for (const list of Object.values(req.files)) files.push(...list);
  return files;
};

/**
 * Copies the files a request uploaded to lasting storage, once the request has
 * succeeded. A file the controller rejected has already been deleted from disk,
 * so it is never copied; a failed request copies nothing. Mounted once, before
 * the routes, so no upload route has to remember it.
 */
export const keepUploads = (req: Request, res: Response, next: NextFunction): void => {
  const store = driver();
  if (store.name === localDriver.name) {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    for (const file of filesOf(req)) {
      const key = keyFor(file.path);
      if (!key || !fs.existsSync(file.path)) continue;
      store.save(key, file.path, file.mimetype).catch((err: unknown) => {
        console.error(`Could not keep upload ${key}`, (err as Error).message);
      });
    }
  });
  next();
};

/**
 * Serves an upload that is no longer on this server's disk (it restarted or was
 * redeployed) from lasting storage, and keeps a local copy for next time.
 * Mounted after the signature check and the static files.
 */
export const serveKeptUploads = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const store = driver();
  const key = keyForUrl(req.path);
  if (store.name === localDriver.name || !key) {
    next();
    return;
  }
  try {
    const file = await store.read(key);
    if (!file) {
      next();
      return;
    }
    const local = path.join(UPLOAD_ROOT, key);
    fs.mkdir(path.dirname(local), { recursive: true }, () => fs.writeFile(local, file.body, () => undefined));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(file.body);
  } catch (err) {
    console.error(`Could not fetch upload ${key}`, (err as Error).message);
    next();
  }
};

/** Removes a kept upload by its /uploads/... URL; the local copy goes too. */
export const removeUpload = (url: string | null | undefined): void => {
  const key = url ? keyForUrl(url.split('?')[0]) : null;
  if (!key) return;
  fs.rm(path.join(UPLOAD_ROOT, key), { force: true }, () => undefined);
  const store = driver();
  if (store.name !== localDriver.name) {
    store.remove(key).catch((err: unknown) => console.error(`Could not remove upload ${key}`, (err as Error).message));
  }
};
