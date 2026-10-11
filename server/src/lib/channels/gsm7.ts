/**
 * Keeping SMS text inside the GSM-7 alphabet, and counting what it will cost.
 *
 * A message that is all GSM-7 fits 160 characters in one segment. A single
 * character outside it -- a curly apostrophe, an emoji -- switches the whole
 * message to UCS-2 at 70 characters a segment, and each segment is billed.
 * Kinyarwanda needs no accents, so it fits GSM-7 comfortably; what pushes it
 * out is punctuation that editors and phones insert on their own, most often
 * the apostrophe in elisions like "n'".
 */

const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Reachable through an escape, so each costs two characters of the 160.
const EXTENSION = '^{}\\[~]|€\f';

const basicSet = new Set(BASIC);
const extensionSet = new Set(EXTENSION);

const isGsmChar = (ch: string) => basicSet.has(ch) || extensionSet.has(ch);

/** Typographic characters with a plain GSM-7 equivalent. */
const REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚‛′´`]/g, "'"],
  [/[“”„‟″«»]/g, '"'],
  [/[‐-―−]/g, '-'],
  [/…/g, '...'],
  [/•/g, '-'],
  [/[     ]/g, ' '],
  [/\t/g, ' '],
];

// Invisible characters and emoji have no equivalent worth keeping; they are
// dropped rather than allowed to triple the price of the message.
const DROP = /[​-‍⁠﻿︎️]|\p{Extended_Pictographic}|\p{Emoji_Modifier}/gu;

/**
 * Rewrites text so that it stays GSM-7 where it reasonably can.
 *
 * Accented letters GSM-7 lacks lose their accent (ê -> e) rather than being
 * dropped. Anything still outside the alphabet is left alone: segmentCount then
 * reports the UCS-2 cost honestly instead of the text being silently mangled.
 */
export const toGsm7 = (text: string): string => {
  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(DROP, '');

  return Array.from(out)
    .map((ch) => {
      if (isGsmChar(ch)) return ch;
      const bare = ch.normalize('NFD').replace(/\p{Mark}/gu, '');
      return bare && Array.from(bare).every(isGsmChar) ? bare : ch;
    })
    .join('');
};

/** True when every character can be sent as GSM-7. */
export const isGsm7 = (text: string): boolean => Array.from(text).every(isGsmChar);

/**
 * How many segments the text is billed as.
 *
 * GSM-7: 160 in one segment, 153 per segment once concatenated, extension
 * characters counting twice. UCS-2: 70, then 67 per segment, counted in UTF-16
 * units because that is what goes on the wire.
 */
export const segmentCount = (text: string): number => {
  if (text.length === 0) return 0;

  if (isGsm7(text)) {
    const units = Array.from(text).reduce((n, ch) => n + (extensionSet.has(ch) ? 2 : 1), 0);
    return units <= 160 ? 1 : Math.ceil(units / 153);
  }

  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
};

/** The most GSM-7 characters that fit in `segments` segments. */
export const capacity = (segments = 1): number => (segments <= 1 ? 160 : segments * 153);
