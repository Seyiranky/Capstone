/**
 * Whether a gig's words say it involves children or working inside someone's
 * home: the jobs where who is let in matters most. Used to suggest the
 * "sensitive" flag; the client and admins can still set it themselves.
 *
 * English and Kinyarwanda, matched as whole words so "son" does not catch
 * "season" and "kid" does not catch "kidney".
 */
const CHILD = [
  'child', 'children', 'kid', 'kids', 'daughter', 'daughters', 'son', 'sons', 'baby', 'babies', 'infant',
  'toddler', 'toddlers', 'nanny', 'babysit', 'babysitter', 'babysitting', 'childcare', 'minor', 'minors',
  'pupil', 'pupils', 'schoolchild', 'umwana', 'abana', 'uruhinja', 'impinja',
];
const HOME = [
  'inside my home', 'inside my house', 'in my home', 'in my house', 'at my home', 'at my house',
  'my apartment', 'my flat', 'live-in', 'live in', 'housekeeper', 'housekeeping', 'house help', 'housemaid',
  'mu rugo', 'iwanjye', 'mu nzu yanjye',
];

const words = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' ')} `;

export const looksSensitive = (title: string, description: string): boolean => {
  const text = words(`${title} ${description}`);
  return CHILD.some((w) => text.includes(` ${w} `)) || HOME.some((p) => text.includes(` ${p} `));
};
