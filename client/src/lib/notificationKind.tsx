import type { ReactNode } from 'react';
import {
  AlertOutlined,
  AuditOutlined,
  BellOutlined,
  CustomerServiceOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  StarOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { Role } from '../types';

export type NotificationKind =
  | 'payment'
  | 'job'
  | 'done'
  | 'declined'
  | 'team'
  | 'review'
  | 'dispute'
  | 'safety'
  | 'cover'
  | 'skill'
  | 'account'
  | 'support';

interface KindInfo {
  icon: ReactNode;
  /** The accent class suffix: isoko-accent-<tone> in global.css. */
  tone: 'blue' | 'teal' | 'amber' | 'violet' | 'rose' | 'green' | 'grey';
  /** Where the notice is about, by role. */
  link: (role: Role | null) => string;
}

const toMatches = (role: Role | null) => (role === 'admin' ? '/admin/jobs' : '/marketplace?tab=matches');

export const KINDS: Record<NotificationKind, KindInfo> = {
  payment: { icon: <WalletOutlined />, tone: 'green', link: (r) => (r === 'admin' ? '/admin/payments' : '/wallet') },
  done: { icon: <CheckCircleOutlined />, tone: 'green', link: toMatches },
  declined: { icon: <CloseCircleOutlined />, tone: 'rose', link: toMatches },
  job: { icon: <ToolOutlined />, tone: 'blue', link: toMatches },
  team: { icon: <TeamOutlined />, tone: 'teal', link: toMatches },
  review: { icon: <StarOutlined />, tone: 'amber', link: () => '/dashboard' },
  dispute: { icon: <AuditOutlined />, tone: 'amber', link: () => '/disputes' },
  safety: { icon: <AlertOutlined />, tone: 'rose', link: (r) => (r === 'admin' ? '/admin/safety' : toMatches(r)) },
  cover: { icon: <SafetyOutlined />, tone: 'teal', link: (r) => (r === 'admin' ? '/admin/cover' : toMatches(r)) },
  skill: { icon: <SafetyCertificateOutlined />, tone: 'violet', link: (r) => (r === 'admin' ? '/admin/reviews' : '/dashboard') },
  account: { icon: <BellOutlined />, tone: 'grey', link: (r) => (r === 'admin' ? '/admin/reports' : '/settings') },
  support: { icon: <CustomerServiceOutlined />, tone: 'blue', link: (r) => (r === 'admin' ? '/admin/support' : '/support') },
};

// Notices are stored as sent, with no type column, so the kind is read from the
// title. Order matters: the first rule that fits wins.
const RULES: [RegExp, NotificationKind][] = [
  [/support/i, 'support'],
  [/paid|payment/i, 'payment'],
  [/marked done/i, 'done'],
  [/work finished|mark the job done/i, 'job'],
  [/dispute|mediate|appeal/i, 'dispute'],
  [/sos|visit not checked|arrived|safety alert|checking on you/i, 'safety'],
  [/cover/i, 'cover'],
  [/report|suspended|reactivated/i, 'account'],
  [/review(?!er)|endorsed/i, 'review'],
  [/skill/i, 'skill'],
  [/crew|apprentice|team member/i, 'team'],
  [/declined|cancelled|called off|not selected|rejected|filled|expired|withdrawn/i, 'declined'],
  [/confirmed|approved|selected/i, 'done'],
  [/gig|worker|match|application|applicant|asked for you/i, 'job'],
];

export const kindOf = (title: string): NotificationKind =>
  RULES.find(([re]) => re.test(title))?.[1] ?? 'account';

/** "Today", "Yesterday" or "Earlier", for grouping a list by when it arrived. */
export const dayGroup = (iso: string): 'today' | 'yesterday' | 'earlier' => {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return 'today';
  start.setDate(start.getDate() - 1);
  return d >= start ? 'yesterday' : 'earlier';
};
