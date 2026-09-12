import type { Role } from '../types';

export const REGISTERABLE_ROLES: Role[] = ['worker', 'client'];

export const ROLE_OPTIONS = REGISTERABLE_ROLES.map((r) => ({
  value: r,
  label: r.charAt(0).toUpperCase() + r.slice(1),
}));
