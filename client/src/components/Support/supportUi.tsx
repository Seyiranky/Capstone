import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertOutlined,
  BugOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { SupportCategory, SupportPriority, SupportStatus } from '../../api/supportApi';

type Tone = 'blue' | 'teal' | 'amber' | 'violet' | 'rose' | 'green' | 'grey';

/** Each topic's icon and colour, the same everywhere a topic is shown. */
export const CATEGORY_META: Record<SupportCategory, { icon: ReactNode; tone: Tone }> = {
  payment: { icon: <WalletOutlined />, tone: 'green' },
  account: { icon: <UserOutlined />, tone: 'blue' },
  skills: { icon: <SafetyCertificateOutlined />, tone: 'violet' },
  job: { icon: <ToolOutlined />, tone: 'teal' },
  safety: { icon: <AlertOutlined />, tone: 'rose' },
  bug: { icon: <BugOutlined />, tone: 'amber' },
  other: { icon: <QuestionCircleOutlined />, tone: 'grey' },
};

export const CategoryIcon = ({ category, size = 36 }: { category: SupportCategory; size?: number }) => (
  <span
    className={`isoko-stat-icon isoko-accent-${CATEGORY_META[category].tone}`}
    style={{ width: size, height: size, fontSize: size * 0.47, borderRadius: size / 3.5, flexShrink: 0 }}
  >
    {CATEGORY_META[category].icon}
  </span>
);

const STATUS_TONE: Record<SupportStatus, string> = {
  open: 'info',
  waiting_on_user: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

export const StatusPill = ({ status }: { status: SupportStatus }) => {
  const { t } = useTranslation();
  return <span className={`isoko-status isoko-status--${STATUS_TONE[status]}`}>{t(`support.status_${status}`)}</span>;
};

const PRIORITY_COLOR: Record<SupportPriority, string> = {
  urgent: '#e11d48',
  high: '#f59e0b',
  normal: '#2563eb',
  low: '#a1a1aa',
};
export const priorityColor = (p: SupportPriority) => PRIORITY_COLOR[p];

export const PriorityTag = ({ priority }: { priority: SupportPriority }) => (
  <span className="isoko-priority" style={{ color: PRIORITY_COLOR[priority] }}>
    <span className="isoko-priority__dot" style={{ background: PRIORITY_COLOR[priority] }} />
    {priority[0].toUpperCase() + priority.slice(1)}
  </span>
);

/** "3 h", "2 d": how long something has waited. */
export const waited = (iso: string) => {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
};
