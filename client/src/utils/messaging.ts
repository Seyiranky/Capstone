import type { Role } from '../types';

const ALLOWED_PAIRS: [Role, Role][] = [
  ['worker', 'admin'],
  ['worker', 'client'],
  // Admins answer clients too: about an application, a dispute or a support request.
  ['client', 'admin'],
];

export const canMessage = (roleA: Role | null, roleB: Role | null): boolean => {
  if (!roleA || !roleB) return false;
  return ALLOWED_PAIRS.some(([a, b]) => (roleA === a && roleB === b) || (roleA === b && roleB === a));
};
