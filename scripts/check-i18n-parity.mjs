#!/usr/bin/env node
/**
 * Fails if the English and Kinyarwanda locales have drifted apart.
 *
 * NFR-1 commits to a bilingual interface, but nothing about adding an English
 * string forces a translation to follow. A missing key falls back to English
 * silently, so the interface degrades for exactly the users least able to
 * tolerate it, and no test would notice.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = join(root, 'client', 'src', 'i18n', 'locales');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

const load = (lang) => JSON.parse(readFileSync(join(localeDir, `${lang}.json`), 'utf8'));

const en = load('en');
const rw = load('rw');

const enKeys = flatten(en).sort();
const rwKeys = flatten(rw).sort();

const missingInRw = enKeys.filter((k) => !rwKeys.includes(k));
const missingInEn = rwKeys.filter((k) => !enKeys.includes(k));

// A key present in both but with identical text is usually an untranslated
// copy-paste. Proper nouns and short tokens legitimately match, so this warns
// rather than fails.
const valueAt = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
const untranslated = enKeys
  .filter((k) => rwKeys.includes(k))
  .filter((k) => {
    const a = valueAt(en, k);
    const b = valueAt(rw, k);
    return typeof a === 'string' && a === b && a.length > 12;
  });

console.log(`en: ${enKeys.length} keys, rw: ${rwKeys.length} keys`);

if (untranslated.length) {
  console.log(`\nWarning: ${untranslated.length} key(s) identical in both locales:`);
  untranslated.forEach((k) => console.log(`  ${k}`));
}

if (missingInRw.length || missingInEn.length) {
  if (missingInRw.length) {
    console.error(`\nMissing from rw.json (${missingInRw.length}):`);
    missingInRw.forEach((k) => console.error(`  ${k}`));
  }
  if (missingInEn.length) {
    console.error(`\nMissing from en.json (${missingInEn.length}):`);
    missingInEn.forEach((k) => console.error(`  ${k}`));
  }
  process.exit(1);
}

console.log('\nLocales are in step.');
