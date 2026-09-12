import type { Role } from '../../types';

export interface NavEntry {
  /** Route path; also the antd Menu item key. */
  key: string;
  /** i18n key under `sidebar.*`. */
  labelKey: string;
  /** Visible to these roles only; omit for everyone. */
  roles?: Role[];
}

export const NAV_ENTRIES: NavEntry[] = [
  { key: '/dashboard', labelKey: 'sidebar.dashboard' },
  { key: '/marketplace', labelKey: 'sidebar.marketplace' },
  { key: '/wallet', labelKey: 'sidebar.wallet', roles: ['worker', 'client'] },
  { key: '/notifications', labelKey: 'sidebar.notifications' },
  { key: '/admin', labelKey: 'sidebar.admin', roles: ['admin'] },
  { key: '/settings', labelKey: 'sidebar.settings' },
];

export const visibleNavEntries = (role: Role | null): NavEntry[] =>
  NAV_ENTRIES.filter((e) => !e.roles || (role != null && e.roles.includes(role)));

/** Longest matching nav key for a pathname, e.g. /admin/users -> /admin. */
export const activeNavKey = (pathname: string): string | undefined => {
  const match = NAV_ENTRIES.map((e) => e.key)
    .filter((k) => pathname === k || pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match;
};
