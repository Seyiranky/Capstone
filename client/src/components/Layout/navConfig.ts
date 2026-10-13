import type { Role } from '../../types';

export interface NavEntry {
  /** Route path; also the antd Menu item key. */
  key: string;
  /** i18n key for the label. */
  labelKey: string;
  /** Visible to these roles only; omit for everyone. */
  roles?: Role[];
  /** Section heading (i18n key) the entry sits under. Admins' sidebar is grouped. */
  group?: string;
}

/**
 * Every page in the sidebar, in order.
 *
 * Workers and clients have a short flat list. Admins run the platform from the
 * sidebar, so their pages are grouped by job: operations, money, people and
 * trust, insights and system. Every admin page is one click away rather than
 * behind tabs on another page.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { key: '/dashboard', labelKey: 'sidebar.dashboard' },
  { key: '/marketplace', labelKey: 'sidebar.marketplace', roles: ['worker', 'client'] },
  { key: '/wallet', labelKey: 'sidebar.wallet', roles: ['worker', 'client'] },
  { key: '/growth', labelKey: 'sidebar.growth', roles: ['worker'] },
  { key: '/disputes', labelKey: 'sidebar.disputes', roles: ['worker', 'client'] },
  { key: '/notifications', labelKey: 'sidebar.notifications', roles: ['worker', 'client'] },
  { key: '/settings', labelKey: 'sidebar.settings', roles: ['worker', 'client'] },

  { key: '/admin/gigs/pending', labelKey: 'adminNav.gigApprovals', roles: ['admin'], group: 'adminNav.operations' },
  { key: '/admin/reviews', labelKey: 'adminNav.skillReviews', roles: ['admin'], group: 'adminNav.operations' },
  { key: '/admin/jobs', labelKey: 'adminNav.jobs', roles: ['admin'], group: 'adminNav.operations' },
  { key: '/disputes', labelKey: 'sidebar.disputes', roles: ['admin'], group: 'adminNav.operations' },
  { key: '/admin/safety', labelKey: 'adminNav.safety', roles: ['admin'], group: 'adminNav.operations' },
  { key: '/marketplace', labelKey: 'sidebar.marketplace', roles: ['admin'], group: 'adminNav.operations' },

  { key: '/admin/payments', labelKey: 'adminNav.payments', roles: ['admin'], group: 'adminNav.money' },

  { key: '/admin/users', labelKey: 'adminNav.users', roles: ['admin'], group: 'adminNav.people' },
  { key: '/admin/reviewers', labelKey: 'adminNav.reviewers', roles: ['admin'], group: 'adminNav.people' },
  { key: '/admin/audit', labelKey: 'adminNav.audit', roles: ['admin'], group: 'adminNav.people' },

  { key: '/admin', labelKey: 'adminNav.analytics', roles: ['admin'], group: 'adminNav.insights' },
  { key: '/admin/metrics', labelKey: 'adminNav.metrics', roles: ['admin'], group: 'adminNav.insights' },
  { key: '/admin/market', labelKey: 'adminNav.market', roles: ['admin'], group: 'adminNav.insights' },
  { key: '/admin/fairwork', labelKey: 'adminNav.fairwork', roles: ['admin'], group: 'adminNav.insights' },

  { key: '/admin/system', labelKey: 'adminNav.systemHealth', roles: ['admin'], group: 'adminNav.system' },
  { key: '/notifications', labelKey: 'sidebar.notifications', roles: ['admin'], group: 'adminNav.account' },
  { key: '/settings', labelKey: 'sidebar.settings', roles: ['admin'], group: 'adminNav.account' },
];

export const visibleNavEntries = (role: Role | null): NavEntry[] =>
  NAV_ENTRIES.filter((e) => !e.roles || (role != null && e.roles.includes(role)));

/** Longest matching nav key for a pathname, e.g. /admin/users -> /admin/users, not /admin. */
export const activeNavKey = (pathname: string): string | undefined => {
  const match = NAV_ENTRIES.map((e) => e.key)
    .filter((k) => pathname === k || pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match;
};
