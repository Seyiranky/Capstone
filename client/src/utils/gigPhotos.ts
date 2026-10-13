import type { SkillCategory } from '../types';

/**
 * Stock cover photos for gigs posted without one, several per trade.
 *
 * A gig always gets the same photo (chosen from its id), and with six or more
 * per trade, neighbouring cards in the same trade rarely repeat.
 */
const files = import.meta.glob<string>('../assets/gigs/*.jpg', { eager: true, import: 'default' });

const POOLS: Record<string, string[]> = {};
for (const [path, url] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
  const category = path.split('/').pop()!.replace(/-\d+\.jpg$/, '');
  (POOLS[category] ??= []).push(url);
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const tradePhoto = (category?: SkillCategory | string | null, seed = ''): string | undefined => {
  const pool = category ? POOLS[category] : undefined;
  return pool?.length ? pool[hash(seed) % pool.length] : undefined;
};
