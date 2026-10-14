import { Fragment } from 'react';
import { Flex, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fromNow } from '../../lib/time';
import { KINDS, dayGroup, kindOf } from '../../lib/notificationKind';
import type { AppNotification } from '../../types';

/** One notice: a coloured icon for its kind, the title, the text and when. */
export const NotificationRow = ({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) => {
  const kind = KINDS[kindOf(n.title)];
  return (
    <div
      role="button"
      tabIndex={0}
      className={`isoko-notif${n.readAt ? '' : ' isoko-notif--unread'}`}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(n)}
    >
      <span className={`isoko-notif__icon isoko-accent-${kind.tone}`}>{kind.icon}</span>
      <div className="isoko-notif__body">
        <div className="isoko-notif__title">{n.title}</div>
        {n.body && <div className="isoko-notif__text">{n.body}</div>}
        <div className="isoko-notif__time">{fromNow(n.createdAt)}</div>
      </div>
      {!n.readAt && <span className="isoko-notif__dot" aria-label="unread" />}
    </div>
  );
};

/** Notices grouped into Today, Yesterday and Earlier, newest first. */
const NotificationList = ({
  items,
  onOpen,
  emptyText,
}: {
  items: AppNotification[];
  onOpen: (n: AppNotification) => void;
  emptyText?: string;
}) => {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <Flex vertical align="center" gap={6} style={{ padding: '40px 16px', textAlign: 'center' }}>
        <span className="isoko-stat-icon isoko-accent-grey" style={{ width: 52, height: 52, fontSize: 22, borderRadius: '50%' }}>
          <BellOutlined />
        </span>
        <Typography.Text strong style={{ marginTop: 6 }}>
          {emptyText ?? t('inbox.empty')}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, maxWidth: 280 }}>
          {t('inbox.emptyHint')}
        </Typography.Text>
      </Flex>
    );
  }
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let last: string | null = null;
  return (
    <div>
      {sorted.map((n) => {
        const group = dayGroup(n.createdAt);
        const heading = group !== last ? group : null;
        last = group;
        return (
          <Fragment key={n.id}>
            {heading && <div className="isoko-notif-group">{t(`inbox.${heading}`)}</div>}
            <NotificationRow n={n} onOpen={onOpen} />
          </Fragment>
        );
      })}
    </div>
  );
};

export default NotificationList;
