import { useTranslation } from 'react-i18next';
import type { SupportCategory, SupportPriority, SupportStatus } from '../../api/supportApi';
import { CATEGORY_META } from './supportMeta';

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

export const PriorityTag = ({ priority }: { priority: SupportPriority }) => (
  <span className={`isoko-priority isoko-priority--${priority}`}>
    <span className="isoko-priority__dot" />
    {priority[0].toUpperCase() + priority.slice(1)}
  </span>
);
