/**
 * Spots messages that move a deal off the platform.
 *
 * The commonest marketplace fraud is "pay me directly on MoMo": the payment
 * never goes through Isoko, so there is no receipt, no Job Cover and no
 * dispute record behind it. A message is not blocked for this; people have
 * good reasons to share a number (directions on the day). It is flagged, and
 * the app reminds both sides that only payments made through Isoko are covered.
 *
 * `payment` wins over `contact`: talk of paying outside is the stronger signal.
 */
export type OffPlatformFlag = 'contact' | 'payment';

// English and Kinyarwanda, including MoMo's USSD codes (*182*...).
const PAYMENT_PATTERNS = [
  /\bmomo\b/i,
  /mobile\s*money/i,
  /\*18[0-9]\*/,
  /\bairtel\s*money\b/i,
  /pay\s+(me\s+)?(directly|outside|in\s+cash|cash)/i,
  /(outside|off)\s+(of\s+)?(isoko|the\s+(app|platform|site))/i,
  /without\s+(isoko|the\s+(app|platform))/i,
  /\b(send|transfer)\s+(me\s+)?(the\s+)?(money|payment|cash)\b/i,
  /\bwestern\s+union\b/i,
  /mpa\s+amafaranga|unyoherereze\s+amafaranga|ohereza\s+amafaranga|kwishyura\s+hanze/i,
];

const CONTACT_PATTERNS = [
  // Phone numbers: +250 788 123 456, 0788123456, 078-812-3456 and the like.
  /(\+?\d[\s.-]?){9,}/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\bwhats\s*app\b|\bwa\.me\//i,
  /\btelegram\b|\bt\.me\//i,
];

export const offPlatformFlag = (text: string): OffPlatformFlag | null => {
  if (!text) return null;
  if (PAYMENT_PATTERNS.some((p) => p.test(text))) return 'payment';
  if (CONTACT_PATTERNS.some((p) => p.test(text))) return 'contact';
  return null;
};
