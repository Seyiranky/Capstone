#!/usr/bin/env node
/**
 * Fails if code kept in two places has drifted apart.
 *
 * The sensitive-gig keyword check runs on the server, which decides, and in the
 * browser, which only tells a client as they type that the gig will be marked
 * sensitive. The two builds cannot share a module without a shared package, so
 * the file is copied; this keeps the copies honest. Comments may differ (each
 * copy says where the other lives); the code may not.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const COPIES = [['server/src/lib/sensitiveGig.ts', 'client/src/lib/sensitiveGig.ts']];

/** The code without comments or layout, so only a real change counts. */
const code = (path) =>
  readFileSync(join(root, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

let failed = false;
for (const [a, b] of COPIES) {
  if (code(a) !== code(b)) {
    console.error(`${a} and ${b} differ. Change both, or neither.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('Shared copies are in step.');
