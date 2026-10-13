import crypto from 'crypto';
import type { SkillCategory } from '../types/domain';

/**
 * Job Cover terms.
 *
 * Modelled on embedded micro-insurance (Turaco): a small premium priced per
 * job, bought at the moment of paying, instead of a policy a casual worker
 * would never buy for themselves. The insurer is simulated.
 */
export const COVER_RATE = 0.02;
export const COVER_MIN_PREMIUM = 300;
/** Most the insurer pays for medical costs from one job's accident, in RWF. */
export const COVER_LIMIT = 300_000;
/** Days after the job is paid in which a claim may still be filed. */
export const CLAIM_WINDOW_DAYS = 7;

/** Work done at the client's place or on site. Digital work is done at a desk of the worker's choosing. */
export const isOnSite = (category?: SkillCategory | string | null) => !!category && category !== 'digital_web';

export const premiumFor = (price: number) => Math.max(COVER_MIN_PREMIUM, Math.round(price * COVER_RATE));

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A policy number, e.g. COV-7KQ2-M9XD: random, like receipt numbers, so policies cannot be enumerated. */
export const policyNumber = () => {
  const chars = [...crypto.randomBytes(8)].map((b) => ALPHABET[b % 32]).join('');
  return `COV-${chars.slice(0, 4)}-${chars.slice(4)}`;
};
